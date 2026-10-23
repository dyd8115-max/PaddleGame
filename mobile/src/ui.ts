// 게임 영역 안 버튼 위치 (논리 좌표). 그리기와 터치 판정이 같이 쓴다
import { Rect } from './game/geometry';

export const UI = {
  start: new Rect(130, 398, 220, 60),
  ranking: new Rect(150, 474, 180, 44),
  newGame: new Rect(150, 520, 180, 34),   // 엘프 중간 저장이 있을 때만: 처음부터 새로 하기
  resume: new Rect(130, 300, 220, 56),
  quit: new Rect(130, 372, 220, 56),
  exitCancel: new Rect(90, 350, 140, 52),
  exitOk: new Rect(250, 350, 140, 52),
};

export type Overlay = 'none' | 'pause' | 'exit';
