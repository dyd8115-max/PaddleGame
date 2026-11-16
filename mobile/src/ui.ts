// 게임 영역 안 버튼 위치 (논리 좌표). 그리기와 터치 판정이 같이 쓴다
// 메뉴 버튼은 높이 640 상자 기준 (menuTop 만큼 내려서 그림)
import { Rect } from './game/geometry';
import { AD_RECT, ARC, COIN_RECT, arcadeFooter2Rect } from './draw/arcade';

export const UI = {
  // 홈 = 오락실 게임기 (그림 자리는 draw/arcade.ts 의 ARC)
  coin: COIN_RECT,                                                    // 왼쪽 위: 코인 (누르면 상점)
  charBtn: new Rect(30, 388, 96, 138),                                // 조작판 왼쪽 캐릭터 (누르면 캐릭터 고르기)
  gamePrev: new Rect(124, 420, 48, 106),                              // 조이스틱 왼쪽 반: 이전 게임
  gameNext: new Rect(172, 420, 48, 106),                              // 조이스틱 오른쪽 반: 다음 게임
  gameBox: ARC.screen,                                                // 게임기 화면 (누르면 전체 목록)
  start: new Rect(250, 444, 64, 82),                                  // 빨간 버튼
  listBtn: new Rect(316, 448, 58, 78),                                // 파란 버튼: 게임 목록
  ranking: new Rect(374, 450, 56, 76),                                // 노란 버튼: 랭킹 (토스에서만)
  adBonus: AD_RECT,                                                   // 판이 끝난 뒤: 광고 보고 코인 한 번 더
  // 숫자 벽돌깨기 중간 저장이 있을 때만: 처음부터 새로 하기 (게임기 화면 아래 줄)
  newGame: (_below: boolean) => arcadeFooter2Rect(),
  resume: new Rect(130, 300, 220, 56),
  quit: new Rect(130, 372, 220, 56),
  howTo: new Rect(130, 444, 220, 50),   // 일시정지: 게임 방법
  exitCancel: new Rect(90, 350, 140, 52),
  exitOk: new Rect(250, 350, 140, 52),
};

export type Overlay = 'none' | 'pause' | 'exit';
