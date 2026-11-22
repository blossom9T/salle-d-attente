// Transport des messages entre joueurs d'un même salon.
//
//  - TransportSupabase : en ligne, via Supabase Realtime (broadcast + presence).
//  - TransportLocal    : sans configuration, via BroadcastChannel (onglets d'un même navigateur).
//
// Les deux exposent la même interface :
//   connecter(), envoyer(type, donnees), quitter()
//   surMessage(fn(type, donnees, expediteur)), surPresence(fn(membres))
import { SUPABASE_URL, SUPABASE_CLE } from "./config.js";

export const enLigne = Boolean(SUPABASE_URL && SUPABASE_CLE);

let clientSupabase = null;
export function supabase() {
  if (!enLigne) return Promise.resolve(null);
  clientSupabase ||= import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm").then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_CLE, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 20 } },
    })
  );
  return clientSupabase;
}

export function creerTransport(code, membre) {
  return enLigne ? new TransportSupabase(code, membre) : new TransportLocal(code, membre);
}

class TransportBase {
  constructor(code, membre) {
    this.code = code;
    this.membre = membre; // { cle, pid, pseudo, couleur, arrivee }
    this.fnMessage = () => {};
    this.fnPresence = () => {};
  }
  surMessage(fn) { this.fnMessage = fn; }
  surPresence(fn) { this.fnPresence = fn; }
}

// ── En ligne ─────────────────────────────────────────────────
class TransportSupabase extends TransportBase {
  async connecter() {
    const sb = await supabase();
    this.sb = sb;
    this.canal = sb.channel(`salle-attente:${this.code}`, {
      config: { broadcast: { self: false, ack: false }, presence: { key: this.membre.cle } },
    });
    this.canal.on("broadcast", { event: "m" }, ({ payload }) => {
      if (payload && payload.de !== this.membre.cle) this.fnMessage(payload.t, payload.d, payload.de);
    });
    this.canal.on("presence", { event: "sync" }, () => {
      const etat = this.canal.presenceState();
      const membres = Object.values(etat).map((metas) => metas[0]).filter(Boolean);
      this.fnPresence(membres.map(({ presence_ref, ...m }) => m));
    });
    await new Promise((ok, ko) => {
      const minuteur = setTimeout(() => ko(new Error("Le serveur temps réel ne répond pas.")), 12000);
      this.canal.subscribe(async (statut, err) => {
        if (statut === "SUBSCRIBED") {
          clearTimeout(minuteur);
          await this.canal.track(this.membre);
          ok();
        } else if (statut === "CHANNEL_ERROR" || statut === "TIMED_OUT") {
          clearTimeout(minuteur);
          ko(err || new Error("Connexion au salon impossible."));
        }
      });
    });
  }
  envoyer(type, donnees) {
    this.canal?.send({ type: "broadcast", event: "m", payload: { t: type, d: donnees, de: this.membre.cle } });
  }
  async quitter() {
    if (!this.canal) return;
    try {
      await this.canal.untrack();
    } catch {}
    this.sb.removeChannel(this.canal);
    this.canal = null;
  }
}

// ── Local (même navigateur) ──────────────────────────────────
// Présence simulée : chaque onglet envoie un « battement » toutes les secondes.
class TransportLocal extends TransportBase {
  async connecter() {
    this.membres = new Map([[this.membre.cle, { ...this.membre, vu: Infinity }]]);
    this.canal = new BroadcastChannel(`salle-attente:${this.code}`);
    this.canal.onmessage = ({ data }) => {
      if (!data || data.de === this.membre.cle) return;
      if (data.t === "_presence" || data.t === "_coucou") {
        const nouveau = !this.membres.has(data.de);
        this.membres.set(data.de, { ...data.d, vu: Date.now() });
        if (data.t === "_coucou") this.poster("_presence", this.membre);
        if (nouveau) this.publierPresence();
      } else if (data.t === "_depart") {
        if (this.membres.delete(data.de)) this.publierPresence();
      } else {
        this.fnMessage(data.t, data.d, data.de);
      }
    };
    this.poster("_coucou", this.membre);
    this.battement = setInterval(() => {
      this.poster("_presence", this.membre);
      let change = false;
      for (const [cle, m] of this.membres) {
        if (cle !== this.membre.cle && Date.now() - m.vu > 3500) {
          this.membres.delete(cle);
          change = true;
        }
      }
      if (change) this.publierPresence();
    }, 1000);
    this.auRevoir = () => this.poster("_depart", null);
    window.addEventListener("pagehide", this.auRevoir);
    this.publierPresence();
    await new Promise((r) => setTimeout(r, 250));
  }
  poster(t, d) {
    this.canal?.postMessage({ t, d, de: this.membre.cle });
  }
  publierPresence() {
    this.fnPresence([...this.membres.values()].map(({ vu, ...m }) => m));
  }
  envoyer(type, donnees) {
    this.poster(type, donnees);
  }
  async quitter() {
    clearInterval(this.battement);
    window.removeEventListener("pagehide", this.auRevoir);
    this.poster("_depart", null);
    this.canal?.close();
    this.canal = null;
  }
}
