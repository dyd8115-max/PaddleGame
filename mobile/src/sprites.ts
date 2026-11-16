// 미니게임 그림 목록 (이미지 AI로 만든 것). 이름 → 파일 (assets/sp/ 아래)
// 그림이 없으면 각 게임이 직접 그린 모양으로 대신함
export const SPRITE_FILES: Record<string, string> = {
  // 발판 점프
  tower_wall: 'tower_wall.jpg', plat_stone: 'plat_stone.png', plat_crystal: 'plat_crystal.png', plat_wood: 'plat_wood.png', mushroom: 'mushroom.png',
  // 장애물 달리기
  run_sky: 'run_sky.jpg', gem: 'gem.png', run_ground: 'run_ground.jpg', run_soil: 'run_soil.jpg', crate: 'crate.png', thorns: 'thorns.png', bat: 'bat.png', boulder: 'boulder.png',
  // 땅따먹기 방패
  item_shield: 'item_shield.png',
  // 몬스터 버티기 (박쥐는 위의 bat)
  raid_xp: 'raid_xp.png', raid_meat: 'raid_meat.png', raid_magnet: 'raid_magnet.png', raid_chest: 'raid_chest.png', raid_ball: 'raid_ball.png',
  // 벽돌깨기 아이템 캡슐, 동전
  cap_gold: 'cap_gold.png', cap_purple: 'cap_purple.png', coin: 'coin.png',
  raid_slime: 'raid_slime.png', raid_eye: 'raid_eye.png', raid_brute: 'raid_brute.png', raid_boss: 'raid_boss.png',
  // 홈 화면 오락실: 방, 게임기, 거미줄, 조이스틱 (막대·받침)
  // 인형 뽑기: 기계 안쪽, 집게(열림·닫힘), 통 앞판, 레일, 기둥, 인형 10단계
  claw_bg: 'claw_bg.jpg', claw_open: 'claw_open.png', claw_closed: 'claw_closed.png', claw_bin: 'claw_bin.png', claw_rail: 'claw_rail.png', claw_pillar: 'claw_pillar.png',
  doll_slime: 'doll_slime.png', doll_bat: 'doll_bat.png', doll_imp: 'doll_imp.png', doll_eye: 'doll_eye.png', doll_kid: 'doll_kid.png',
  doll_elf: 'doll_elf.png', doll_saint: 'doll_saint.png', doll_knight: 'doll_knight.png', doll_brute: 'doll_brute.png', doll_boss: 'doll_boss.png',
  arcade_btn_red: 'arcade_btn_red.png', arcade_btn_blue: 'arcade_btn_blue.png', arcade_btn_yellow: 'arcade_btn_yellow.png',
  arcade_room: 'arcade_room.jpg', arcade_cabinet: 'arcade_cabinet.png', arcade_web: 'arcade_web.png', arcade_stick: 'arcade_stick.png', arcade_base: 'arcade_base.png',
};
