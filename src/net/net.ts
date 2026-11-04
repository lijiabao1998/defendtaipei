import { tr } from '../i18n';
// Multiplayer client (v20): anonymous auth, room create/join by code, own-player prediction with server
// reconciliation, snapshot+delta state replication (shared core), interpolated remote players, auto-reconnect.
import { clone, patch, TICK_HZ, type State, type Snapshot, type Delta, type Cmd } from '../core/sim/core';
export type NetEv = {
  onState?: (s: State, you: string) => void;
  onStatus?: (t: string) => void;
  onCorrect?: (x: number, z: number) => void;
  onLog?: (l: string[]) => void;
};
const TOK = 'dt-mp-token';
export class Net {
  ws: WebSocket | null = null;
  s: State | null = null;
  you = '';
  code = '';
  seq = 0;
  tok = '';
  status = 'idle';
  tries = 0;
  closed = false;
  lastLogLen = 0;
  reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  states = new Map<number, State>();
  sendT = 0;
  lastEquip = '';
  lastEquipAt = -Infinity;
  pingMs = 0;
  lastMsgAt = 0;
  rejects = 0;
  hello: any = null;
  bytes = 0;
  msgs = 0;
  hist = new Map<string, { t: number; x: number; z: number }[]>(); // remote interpolation buffers
  constructor(
    public base: string,
    public ev: NetEv = {},
  ) {}
  private async api(p: string, method = 'GET') {
    const r = await fetch(this.base + p, { method, headers: this.tok ? { Authorization: 'Bearer ' + this.tok } : {} });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || r.status);
    return j;
  }
  async auth() {
    this.tok = localStorage.getItem(TOK + ':' + this.base) || '';
    if (!this.tok) {
      const j = await this.api('/api/auth', 'POST');
      this.tok = j.token;
      localStorage.setItem(TOK + ':' + this.base, this.tok);
    }
  }
  async create() {
    await this.auth();
    const j = await this.api('/api/rooms', 'POST');
    return j.code as string;
  }
  async join(code: string, hello: { name: string; role: string; g: string; x: number; z: number }) {
    await this.auth();
    await this.api('/api/rooms/' + code);
    this.closed = false;
    this.code = code;
    this.hello = hello;
    sessionStorage.setItem('dt-mp-room', code);
    this.open();
  }
  private open() {
    if (this.closed) return;
    this.status = this.tries
      ? tr(`重新連線中…（第 ${this.tries} 次）`, `Reconnecting… (attempt ${this.tries})`)
      : tr('連線中…', 'Connecting…');
    this.ev.onStatus?.(this.status);
    const ws = new WebSocket(
      this.base.replace(/^http/, 'ws') + `/api/rooms/${this.code}/ws?token=${encodeURIComponent(this.tok)}`,
    );
    this.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ k: 'hello', ...this.hello }));
    };
    ws.onmessage = e => {
      this.lastMsgAt = performance.now();
      this.bytes += (e.data as string).length;
      this.msgs++;
      if (this.ws !== ws || this.closed) return;
      let m: any;
      try {
        m = JSON.parse(e.data as string);
      } catch {
        return;
      }
      if (m.k === 'snap') {
        const sn = m as Snapshot;
        this.s = sn.s;
        this.you = sn.you;
        this.seq = Math.max(this.seq, sn.s.players[sn.you]?.ack || 0);
        this.ev.onCorrect?.(sn.s.players[sn.you]?.x ?? this.hello.x, sn.s.players[sn.you]?.z ?? this.hello.z);
        this.tries = 0;
        this.status = tr(`房間 ${this.code}`, `Room ${this.code}`);
        this.ev.onStatus?.(this.status);
      } else if (m.k === 'delta' && this.s) {
        const d = m as Delta & { ack?: number };
        const base = this.states.get(d.base);
        if (!base) {
          ws.send(JSON.stringify({ k: 'ack', tick: -1 }));
          return;
        }
        this.s = clone(base);
        patch(this.s, d);
      } else if (m.k === 'rej') {
        this.rejects++;
        if (m.why === 'speed' && this.s) {
          const p = this.s.players[this.you];
          if (p) this.ev.onCorrect?.(p.x, p.z);
        }
        return;
      } else if (m.k === 'err') {
        this.status =
          tr('無法加入：', 'Unable to join: ') +
          (m.e === 'room full' ? tr('房間已滿（最多 4 人）', 'Room is full (4 players maximum)') : m.e);
        this.closed = true;
        this.ev.onStatus?.(this.status);
        return;
      }
      if (this.s) {
        this.states.set(this.s.tick, clone(this.s));
        for (const tick of this.states.keys()) if (tick < this.s.tick - 80) this.states.delete(tick);
      }
      if (m.tick !== undefined) ws.send(JSON.stringify({ k: 'ack', tick: m.tick }));
      if (this.s) {
        const now = performance.now();
        for (const p of Object.values(this.s.players)) {
          if (p.id === this.you) continue;
          const h = this.hist.get(p.id) || [];
          h.push({ t: now, x: p.x, z: p.z });
          if (h.length > 12) h.shift();
          this.hist.set(p.id, h);
        }
        if (this.s.log.length && this.s.log.join() !== this.lastLog) {
          this.lastLog = this.s.log.join();
          this.ev.onLog?.(this.s.log);
        }
        this.ev.onState?.(this.s, this.you);
      }
    };
    ws.onclose = e => {
      if (e.code === 4000) {
        this.closed = true;
        this.ev.onStatus?.(tr('此連線已被另一分頁取代', 'Connection replaced by another tab'));
      }
      if (this.ws !== ws || this.closed) return;
      this.status = tr('連線中斷', 'Disconnected');
      this.ev.onStatus?.(this.status);
      this.tries++;
      this.reconnectTimer = setTimeout(() => this.open(), Math.min(8000, 500 * 2 ** this.tries));
    };
  }
  lastLog = '';
  cmd(c: Omit<Cmd, 'seq'>) {
    if (!this.ws || this.ws.readyState !== 1) return;
    this.ws.send(JSON.stringify({ k: 'cmd', c: { ...c, seq: ++this.seq } }));
  }
  /** Retry unconfirmed equipment without flooding, including after a slow-render ACK backlog. */
  equip(weapon: string) {
    const own = this.s?.players[this.you];
    if (!own || this.ws?.readyState !== 1 || own.weapon === weapon) return;
    const now = performance.now();
    if (this.lastEquip === weapon && now - this.lastEquipAt < 1000) return;
    this.cmd({ t: 'equip', weapon } as any);
    this.lastEquip = weapon;
    this.lastEquipAt = now;
  }
  /** called every frame: send own (predicted) position at the server tick rate */
  update(dt: number, x: number, z: number, veh: boolean, sh?: [number, number, number, number]) {
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 1 / TICK_HZ;
      this.cmd({ t: 'move', x, z, veh, ...(sh ? { sh } : {}) } as any);
    }
  }
  /** remote player position interpolated 100 ms in the past */
  remote(id: string): [number, number] | null {
    const h = this.hist.get(id);
    if (!h || !h.length) return null;
    const t = performance.now() - 100;
    for (let i = h.length - 1; i > 0; i--)
      if (h[i - 1].t <= t) {
        const a = h[i - 1],
          b = h[i];
        const k = Math.min(1, (t - a.t) / Math.max(1, b.t - a.t));
        return [a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k];
      }
    return [h[0].x, h[0].z];
  }
  leave() {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.s = null;
    this.states.clear();
    this.hist.clear();
    sessionStorage.removeItem('dt-mp-room');
  }
}
