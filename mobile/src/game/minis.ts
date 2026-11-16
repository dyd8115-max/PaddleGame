// 미니게임 목록: 모드 → 만들기
import { ClawGame } from './claw';
import type { MiniGame, MiniHost } from './mini';
import type { GameMode } from './objects';
import { Run } from './run';
import { Tower } from './tower';

export const MINI_GAMES: Partial<Record<GameMode, (host: MiniHost, charIndex: number) => MiniGame>> = {
  tower: (h, c) => new Tower(h, c),
  run: (h, c) => new Run(h, c),
  claw: (h, c) => new ClawGame(h, c),
};
