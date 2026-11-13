const fs = require('fs');
const path = 'c:\\Users\\EASYSTORE\\marketplace\\client\\src\\pages\\Freelance.jsx';
let content = fs.readFileSync(path, 'utf8');

// Find the broken block starting from {c[7] ? c[7] : 
const startMarker = '{c[7] ? c[7] : <span className="tw-text-fr-muted">';
const idx = content.indexOf(startMarker);
if (idx >= 0) {
  // Find the end - the last </td> before </tr>
  const afterStart = content.substring(idx);
  const endMatch = afterStart.match(/<\/td>\s*<\/tr>/);
  if (endMatch) {
    const endIdx = idx + endMatch.index + endMatch[0].length;
    const cleanReplacement = `{c[7] ? (
                                  <div className="tw-flex tw-items-center tw-gap-1.5">
                                    <span className="tw-truncate tw-text-[10px] tw-text-fr-text">{c[7]}</span>
                                    <button
                                      type="button"
                                      onClick={() => copyText(c[7])}
                                      className="tw-rounded tw-border tw-border-fr-border tw-bg-fr-surface tw-px-1.5 tw-py-1.5 tw-text-[10px] tw-text-fr-muted tw-transition hover:tw-text-fr-primary"
                                      aria-label="Copier l'e-mail"
                                    >
                                      <Icon path={ICONS.copy} className="tw-h-3 tw-w-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="tw-text-fr-muted">—</span>
                                )}
                              </td>
                              <td className="tw-border-b tw-border-fr-border tw-px-3 tw-py-3 tw-align-top tw-text-xs">
                                <select
                                  value={companyStatus.get(String(idx)) || "pending"}
                                  onChange={(e) => setStatus(idx, e.target.value)}
                                  className="tw-rounded tw-border tw-border-fr-border tw-bg-fr-surface tw-px-2 tw-py-1 tw-text-[10px] tw-text-fr-text"
                                >
                                  {STATUS_OPTIONS.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="fr-no-print tw-border-b tw-border-fr-border tw-px-3 tw-py-3 tw-align-top">
                                <div className="tw-flex tw-flex-wrap tw-gap-1.5">
                                  <button
                                    type="button"
                                    className="tw-inline-flex tw-items-center tw-gap-1 tw-rounded-lg tw-bg-fr-primary tw-px-2.5 tw-py-1.5 tw-text-[11px] tw-font-semibold tw-text-fr-on-primary tw-transition hover:tw-bg-fr-primary-dark"
                                    onClick={() => openContact(c)}
                                  >
                                    <Icon path={ICONS.sparkles} className="tw-h-3.5 tw-w-3.5" />
                                    Contacter
                                  </button>
                                </div>
                              </td>
                            </tr>`;
    content = content.substring(0, idx) + cleanReplacement + content.substring(endIdx);
    fs.writeFileSync(path, content, 'utf8');
    console.log('Fixed table rows successfully');
  } else {
    console.log('Could not find end of broken block');
  }
} else {
  console.log('Could not find start marker');
}

