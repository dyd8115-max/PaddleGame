// 게임 영역 안 버튼 위치 (논리 좌표). 그리기와 터치 판정이 같이 쓴다
// 메뉴 버튼은 높이 640 상자 기준 (menuTop 만큼 내려서 그림)
import { Rect } from './game/geometry';

export const UI = {
  coin: new Rect(150, 70, 180, 34),                                  // 코인 (누르면 상점)
  charCard: (i: number) => new Rect(21 + i * 112, 136, 102, 128),     // 캐릭터 카드 (4장)
  gameTab: (i: number) => new Rect(19 + i * 150, 298, 142, 44),       // 게임 고르기 (3개)
  start: new Rect(130, 404, 220, 60),
  adBonus: new Rect(70, 478, 340, 44),                                // 판이 끝난 뒤: 광고 보고 코인 한 번 더
  // 룬 돌 깨기 중간 저장이 있을 때만: 처음부터 새로 하기 (광고 버튼이 있으면 그 아래)
  newGame: (below: boolean) => (below ? new Rect(150, 532, 180, 36) : new Rect(150, 482, 180, 36)),
  shop: (withRanking: boolean) => (withRanking ? new Rect(88, 584, 146, 42) : new Rect(165, 584, 150, 42)),
  ranking: new Rect(246, 584, 146, 42),
  resume: new Rect(130, 300, 220, 56),
  quit: new Rect(130, 372, 220, 56),
  howTo: new Rect(130, 444, 220, 50),   // 일시정지: 게임 방법
  exitCancel: new Rect(90, 350, 140, 52),
  exitOk: new Rect(250, 350, 140, 52),
};

export type Overlay = 'none' | 'pause' | 'exit';
