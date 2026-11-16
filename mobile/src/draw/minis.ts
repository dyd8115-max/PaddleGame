// 미니게임 그리기 목록: 모드 → 그리기
import type { ClawGame } from '../game/claw';
import type { MiniGame } from '../game/mini';
import type { GameMode } from '../game/objects';
import type { Run } from '../game/run';
import type { Tower } from '../game/tower';
import type { Ctx } from '../gfx';
import { drawClaw } from './claw';
import type { PlayerView } from './common';
import { drawRun } from './run';
import { drawTower } from './tower';

type DrawFn = (ctx: Ctx, g: MiniGame, pl: PlayerView, t: number) => void;
export const MINI_DRAW: Partial<Record<GameMode, DrawFn>> = {
  tower: (ctx, g, pl, t) => drawTower(ctx, g as Tower, pl, t),
  run: (ctx, g, pl, t) => drawRun(ctx, g as Run, pl, t),
  claw: (ctx, g, _pl, t) => drawClaw(ctx, g as ClawGame, t),
};
