import { withTransaction } from "../db.js";
import { detectSmmPlatform } from "./smmPlatforms.js";
import { isSmmPricePublic } from "./smmPricing.js";

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function nextSlug(base, used) {
  let slug = base || "autres";
  if (!used.has(slug)) {
    used.add(slug);
    return slug;
  }
  const stem = slug.slice(0, 70);
  let suffix = 2;
  while (used.has(`${stem}-${suffix}`)) suffix += 1;
  slug = `${stem}-${suffix}`;
  used.add(slug);
  return slug;
}

function normalizeItems(items, options) {
  const markup = Number(options.markup) > 0 ? Number(options.markup) : 1;
  const usdToXaf = Number(options.usdToXaf) > 0 ? Number(options.usdToXaf) : 655.957;
  const acceptedTypes = new Set(
    (Array.isArray(options.types) && options.types.length ? options.types : ["default"]).map(
      (value) => String(value).trim().toLowerCase()
    )
  );
  const rows = [];
  const seen = new Set();
  let skipped = 0;

  for (const item of items || []) {
    const externalId = String(item.external_service_id || "").trim();
    const name = String(item.name || "").trim();
    const itemType = String(item.type || "").trim();
    if (!externalId || !name || seen.has(externalId)) {
      skipped += 1;
      continue;
    }
    if (itemType && !acceptedTypes.has(itemType.toLowerCase())) {
      skipped += 1;
      continue;
    }

    const rate = Number(item.rate);
    const price = Number.isFinite(rate) ? Math.round(rate * usdToXaf * markup * 100) / 100 : 0;
    const rawMin = item.min === null || item.min === undefined || item.min === "" ? null : Number(item.min);
    const rawMax = item.max === null || item.max === undefined || item.max === "" ? null : Number(item.max);
    const categoryName = String(item.category || "").trim() || "Autres";
    const shortDescription = String(item.description || "").trim().slice(0, 300) || null;

    seen.add(externalId);
    rows.push({
      external_service_id: externalId,
      category_name: categoryName,
      category_id: null,
      name,
      short_description: shortDescription,
      price,
      status: isSmmPricePublic(price) ? "active" : "inactive",
      limits: JSON.stringify({
        min: Number.isFinite(rawMin) ? rawMin : null,
        max: Number.isFinite(rawMax) ? rawMax : null,
      }),
      external_price: Number.isFinite(rate) ? rate : null,
      platform: detectSmmPlatform(categoryName, name),
    });
  }

  return { rows, skipped, total: (items || []).length };
}

export function previewProviderCatalogImport(items, options = {}) {
  const { rows, skipped, total } = normalizeItems(items, options);
  return {
    dry_run: true,
    imported: 0,
    would_import: rows.length,
    would_activate: rows.filter((row) => row.status === "active").length,
    would_hide: rows.filter((row) => row.status !== "active").length,
    skipped,
    source_total: total,
  };
}

async function ensureProvider(tx, providerKey, providerName) {
  const rows = await tx.query(`SELECT id FROM smm_providers WHERE provider_key = $1`, [providerKey]);
  if (rows.length) return rows[0].id;
  const created = await tx.query(
    `INSERT INTO smm_providers (name, provider_key, is_active, config)
     VALUES ($1, $2, TRUE, '{}'::jsonb)
     RETURNING id`,
    [providerName, providerKey]
  );
  return created[0].id;
}

async function resolveCategories(tx, rows, forcedCategoryId) {
  if (forcedCategoryId) {
    const found = await tx.query(`SELECT id FROM smm_categories WHERE id = $1`, [forcedCategoryId]);
    if (!found.length) throw new Error("Catégorie cible introuvable");
    for (const row of rows) row.category_id = forcedCategoryId;
    return 0;
  }

  const existing = await tx.query(`SELECT id, name, slug FROM smm_categories`);
  const idByName = new Map();
  const usedSlugs = new Set();
  for (const category of existing) {
    idByName.set(String(category.name).trim().toLowerCase(), category.id);
    usedSlugs.add(category.slug);
  }

  const createdNames = new Set();
  const created = [];
  for (const row of rows) {
    const key = row.category_name.trim().toLowerCase();
    if (idByName.has(key)) {
      row.category_id = idByName.get(key);
      continue;
    }
    if (!createdNames.has(key)) {
      createdNames.add(key);
      created.push({
        name: row.category_name.trim(),
        slug: nextSlug(slugify(row.category_name), usedSlugs),
      });
    }
  }

  let createdCount = 0;
  if (created.length) {
    const names = created.map((category) => category.name);
    const slugs = created.map((category) => category.slug);
    const descriptions = created.map(() => null);
    const icons = created.map(() => null);
    const sortOrders = created.map(() => 50);
    const actives = created.map(() => true);
    const inserted = await tx.query(
      `INSERT INTO smm_categories (name, slug, description, icon, sort_order, is_active)
       SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::int[], $6::boolean[])
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [names, slugs, descriptions, icons, sortOrders, actives]
    );
    createdCount = inserted.length;
  }

  const categoryRows = await tx.query(`SELECT id, name, slug FROM smm_categories`);
  const resolvedByName = new Map();
  const resolvedBySlug = new Map();
  for (const category of categoryRows) {
    const key = String(category.name).trim().toLowerCase();
    if (!resolvedByName.has(key)) resolvedByName.set(key, category.id);
    resolvedBySlug.set(String(category.slug), category.id);
  }
  for (const category of created) {
    const key = category.name.trim().toLowerCase();
    const id = resolvedByName.get(key) || resolvedBySlug.get(category.slug);
    if (id && !resolvedByName.has(key)) resolvedByName.set(key, id);
  }
  for (const row of rows) {
    row.category_id = resolvedByName.get(row.category_name.trim().toLowerCase());
  }
  if (rows.some((row) => !row.category_id)) throw new Error("Catégorie fournisseur introuvable");

  const usedIds = [...new Set(rows.map((row) => row.category_id))];
  if (usedIds.length) {
    await tx.query(`UPDATE smm_categories SET is_active = TRUE WHERE id = ANY($1::int[])`, [usedIds]);
  }
  return createdCount;
}

export async function importProviderCatalog(items, options = {}) {
  const providerKey = options.providerKey || "smm_africa";
  const providerName = options.providerName || "SMM Africa";
  const forcedCategoryId = options.categoryId ? Number(options.categoryId) : null;
  const { rows, skipped, total } = normalizeItems(items, options);

  if (!rows.length) {
    return {
      imported: 0,
      created: 0,
      updated: 0,
      skipped,
      categories_created: 0,
      source_total: total,
    };
  }

  return withTransaction(async (tx) => {
    const providerId = await ensureProvider(tx, providerKey, providerName);
    const categoriesCreated = await resolveCategories(tx, rows, forcedCategoryId);

    await tx.query(
      `CREATE TEMP TABLE tmp_smm_items (
         external_service_id TEXT PRIMARY KEY,
         category_id INTEGER NOT NULL,
         name TEXT NOT NULL,
         short_description TEXT,
         price NUMERIC(14,2) NOT NULL,
         status TEXT NOT NULL,
         limits JSONB NOT NULL,
         external_price NUMERIC(14,2),
         platform TEXT NOT NULL
       ) ON COMMIT DROP;
       CREATE TEMP TABLE tmp_smm_resolved (
         external_service_id TEXT PRIMARY KEY,
         service_id INTEGER NOT NULL,
         created BOOLEAN NOT NULL DEFAULT FALSE
       ) ON COMMIT DROP;`
    );

    await tx.query(
      `INSERT INTO tmp_smm_items
         (external_service_id, category_id, name, short_description, price, status, limits, external_price, platform)
       SELECT external_service_id, category_id, name, short_description, price, status, limits::jsonb, external_price, platform
       FROM UNNEST($1::text[], $2::int[], $3::text[], $4::text[], $5::numeric[], $6::text[], $7::text[], $8::numeric[], $9::text[])
         AS t(external_service_id, category_id, name, short_description, price, status, limits, external_price, platform)`,
      [
        rows.map((row) => row.external_service_id),
        rows.map((row) => row.category_id),
        rows.map((row) => row.name),
        rows.map((row) => row.short_description),
        rows.map((row) => row.price),
        rows.map((row) => row.status),
        rows.map((row) => row.limits),
        rows.map((row) => row.external_price),
        rows.map((row) => row.platform),
      ]
    );

    await tx.query(
      `INSERT INTO tmp_smm_resolved (external_service_id, service_id)
       SELECT DISTINCT ON (t.external_service_id) t.external_service_id, m.smm_service_id
       FROM tmp_smm_items t
       JOIN smm_provider_mappings m
         ON m.provider_id = $1 AND m.external_service_id = t.external_service_id
       ORDER BY t.external_service_id, m.id`,
      [providerId]
    );

    await tx.query(
      `INSERT INTO tmp_smm_resolved (external_service_id, service_id)
       SELECT DISTINCT ON (s.id) t.external_service_id, s.id
       FROM tmp_smm_items t
       JOIN smm_services s
         ON s.category_id = t.category_id AND lower(s.name) = lower(t.name)
       WHERE NOT EXISTS (
           SELECT 1 FROM tmp_smm_resolved r WHERE r.external_service_id = t.external_service_id
         )
         AND NOT EXISTS (
           SELECT 1 FROM smm_provider_mappings m
           WHERE m.provider_id = $1 AND m.smm_service_id = s.id
         )
       ORDER BY s.id, t.external_service_id`,
      [providerId]
    );

    await tx.query(
      `WITH inserted AS (
         INSERT INTO smm_services
           (category_id, name, short_description, description, price, currency, billing_unit,
            status, is_automated, is_consulting, is_campaign, external_service_id,
            delivery_days, conditions, limits, platform, sort_order, created_at, updated_at)
         SELECT t.category_id, t.name, t.short_description, NULL, t.price, 'XAF', '1000',
                t.status, TRUE, FALSE, FALSE, t.external_service_id,
                NULL, NULL, t.limits, t.platform, 0, now(), now()
         FROM tmp_smm_items t
         WHERE NOT EXISTS (
           SELECT 1 FROM tmp_smm_resolved r WHERE r.external_service_id = t.external_service_id
         )
         RETURNING id, external_service_id
       )
       INSERT INTO tmp_smm_resolved (external_service_id, service_id, created)
       SELECT external_service_id, id, TRUE FROM inserted`
    );

    await tx.query(
      `UPDATE smm_services s
       SET category_id = t.category_id,
           name = t.name,
           short_description = t.short_description,
           price = t.price,
           currency = 'XAF',
           billing_unit = '1000',
           status = t.status,
           is_automated = TRUE,
           external_service_id = t.external_service_id,
           limits = t.limits,
           platform = t.platform,
           updated_at = now()
       FROM tmp_smm_resolved r
       JOIN tmp_smm_items t ON t.external_service_id = r.external_service_id
       WHERE s.id = r.service_id`
    );

    await tx.query(
      `INSERT INTO smm_provider_mappings
         (provider_id, smm_service_id, external_service_id, external_name, external_price, currency, is_active)
       SELECT $1, r.service_id, t.external_service_id, t.name, t.external_price, 'USD', TRUE
       FROM tmp_smm_resolved r
       JOIN tmp_smm_items t USING (external_service_id)
       ON CONFLICT (provider_id, smm_service_id) DO UPDATE
         SET external_service_id = EXCLUDED.external_service_id,
             external_name = EXCLUDED.external_name,
             external_price = EXCLUDED.external_price,
             currency = EXCLUDED.currency,
             is_active = TRUE`,
      [providerId]
    );

    await tx.query(
      `UPDATE smm_categories c
       SET is_active = FALSE
       WHERE c.is_active = TRUE
         AND NOT EXISTS (
           SELECT 1 FROM smm_services s
           WHERE s.category_id = c.id AND s.status = 'active'
         )`
    );

    const createdRows = await tx.query(
      `SELECT COUNT(*)::int AS n FROM tmp_smm_resolved WHERE created = TRUE`
    );
    const resolvedRows = await tx.query(`SELECT COUNT(*)::int AS n FROM tmp_smm_resolved`);
    const created = Number(createdRows[0]?.n) || 0;
    const resolved = Number(resolvedRows[0]?.n) || 0;

    return {
      imported: rows.length,
      created,
      updated: Math.max(0, resolved - created),
      skipped,
      categories_created: categoriesCreated,
      source_total: total,
    };
  });
}
