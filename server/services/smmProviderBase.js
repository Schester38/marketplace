export class SMMProviderInterface {
  get name() { throw new Error("name doit être implémenté"); }
  get providerKey() { throw new Error("providerKey doit être implémenté"); }
  async fetchCatalog() { throw new Error("fetchCatalog doit être implémenté"); }
  async placeOrder(order) { throw new Error("placeOrder doit être implémenté"); }
  async checkOrderStatus(externalReference) {
    throw new Error("checkOrderStatus doit être implémenté");
  }
  async fetchBalance() { return null; }
  async cancelOrder(externalReference) {
    return { ok: false, error: "Annulation non supportée" };
  }
  async refillOrder(externalReference) {
    return { ok: false, error: "Refill non supporté" };
  }
}
