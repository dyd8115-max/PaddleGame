import { assetUrl } from './assetUrl';

// 소리 재생 (Web Audio). 배경음악은 끊김 없이 반복하고, 효과음은 그 위에 겹쳐 낸다.
// 휴대폰 브라우저는 사용자가 화면을 처음 누른 뒤에야 소리를 낼 수 있어서, unlock() 을 첫 터치에서 부른다.

export type SoundName = 'start' | 'clear' | 'over' | 'brick' | 'stomp';

const FILES: Record<SoundName | 'bgm', string> = {
  bgm: 'assets/bgm.wav',
  start: 'assets/start.mp3',
  clear: 'assets/clear.mp3',
  over: 'assets/over.mp3',
  brick: 'assets/brick.mp3',
  stomp: 'assets/stomp.mp3',
};

const BGM_VOLUME = 0.8;

type Ctx = AudioContext;

export class Audio {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private raw = new Map<string, Promise<ArrayBuffer | null>>();
  private buffers = new Map<string, AudioBuffer>();
  private bgm: AudioBufferSourceNode | null = null;
  private muted_ = false;
  private hidden = false;

  constructor() {
    // 파일은 미리 받아 두고, 해석은 소리 장치를 연 뒤에 한다
    for (const [name, url] of Object.entries(FILES)) {
      this.raw.set(name, fetch(assetUrl(url)).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null));
    }
  }

  get muted(): boolean { return this.muted_; }

  setMuted(m: boolean): void {
    this.muted_ = m;
    if (this.master && this.ctx) this.master.gain.setValueAtTime(m ? 0 : 1, this.ctx.currentTime);
  }

  // 첫 터치에서 호출. 이미 열려 있으면 멈춰 있던 장치만 다시 켠다
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !this.hidden) void this.ctx.resume();
      return;
    }
    // iOS 무음 모드에서도 소리가 나도록 (지원하는 브라우저만)
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    try { if (nav.audioSession) nav.audioSession.type = 'playback'; } catch { /* 무시 */ }

    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted_ ? 0 : 1;
    this.master.connect(ctx.destination);
    void ctx.resume();

    for (const name of Object.keys(FILES)) {
      void this.decode(name).then(() => { if (name === 'bgm') this.startBgm(); });
    }
  }

  private async decode(name: string): Promise<void> {
    const ctx = this.ctx;
    const data = await this.raw.get(name);
    if (!ctx || !data) return;
    try {
      const buf = await new Promise<AudioBuffer>((resolve, reject) => {
        // 예전 Safari 는 콜백 방식만 지원
        const p = ctx.decodeAudioData(data.slice(0), resolve, reject);
        if (p && typeof p.then === 'function') p.then(resolve, reject);
      });
      this.buffers.set(name, buf);
    } catch { /* 이 소리만 생략 */ }
  }

  private startBgm(): void {
    const ctx = this.ctx, buf = this.buffers.get('bgm');
    if (!ctx || !this.master || !buf || this.bgm) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = BGM_VOLUME;
    src.connect(g).connect(this.master);
    src.start();
    this.bgm = src;
  }

  play(name: SoundName): void {
    const ctx = this.ctx, buf = this.buffers.get(name);
    if (!ctx || !this.master || !buf || this.muted_ || this.hidden) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.master);
    src.start();
  }

  // 앱이 백그라운드로 가면 소리를 멈추고, 돌아오면 다시 낸다
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  }
}
