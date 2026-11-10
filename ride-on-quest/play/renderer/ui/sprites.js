/* 仮のドット絵。本番の絵（Grok に描かせてドット絵に整えるもの）が届くまで、コードで描いて使う。
   人型は部品（髪・帽子・服・武器など）を組み合わせ、獣や魔物は文字の格子で描く。どれも黒いふちを自動で付ける。
   RQ.sprites.get(id, view, frame) → { url, canvas, w, h, scale }。view：front（正面）| side（右向き）| back（後ろ姿）。
   frame：0＝立ち、1・2＝歩き。scale は画面に出すときの倍率の目安（オーガや鬼王は大きく）。 */
(function (root) {
  const OUT = '#100c18';   // ふちの色

  // ---- 人型 ----
  // skin 肌、hair 髪（style：short | long | pony | bald）、hat（helm | hood | wizard | crown | band | horns | tiara | cap）、
  // body 服、trim 帯やふち、legs 脚、boots 靴、robe 長い服、cape マント、weapon（sword | staff | mace | club | kanabo | spear | axe | dagger | lute | bow | flask）、
  // shield 盾の色、ears（pointy）、tusks 牙、beard ひげ、stripes 虎の皮の縞、cracks 溶岩のひび、eye 目の色
  const H = {
    // 主人公
    warrior:   { skin: '#f0c090', hair: '#6a4020', hat: 'helm', metal: '#c8ccd8', body: '#b83a30', trim: '#e8c040', legs: '#5a4a3a', boots: '#4a3020', cape: '#2a50a0', weapon: 'sword', shield: '#2a50a0' },
    wizard:    { skin: '#f6d0a8', hair: '#e8b030', style: 'long', hat: 'wizard', hatc: '#5a3aa0', body: '#5a3aa0', trim: '#e8c040', robe: true, weapon: 'staff', orb: '#e05a90' },
    monk:      { skin: '#f0c090', hair: '#3a2a20', style: 'pony', hat: 'band', hatc: '#d03030', body: '#e88a20', trim: '#3a2a20', legs: '#e88a20', boots: '#3a2a20', weapon: null },
    priest:    { skin: '#f0c090', hair: '#7a5030', hat: 'cap', hatc: '#2a7ab0', body: '#2a7ab0', trim: '#f0e8d0', robe: true, weapon: 'mace', metal: '#c8ccd8' },
    queen:     { skin: '#f6d0a8', hair: '#c05030', style: 'long', hat: 'crown', body: '#a02040', trim: '#f0d060', robe: true, cape: '#f0f0f0', weapon: 'staff', orb: '#60c0f0' },
    // 島の人たち
    elder:     { skin: '#e8b890', hair: '#e0e0e0', style: 'bald', beard: '#e0e0e0', body: '#7a6a4a', trim: '#4a3a2a', robe: true, weapon: 'staff', orb: null },
    oldknight: { skin: '#e8b890', hair: '#c0c0c0', beard: '#c0c0c0', hat: 'helm', metal: '#a0a8b8', body: '#7080a0', trim: '#e8c040', legs: '#505868', boots: '#3a3a40', cape: '#802020', weapon: 'sword', shield: '#802020' },
    fairy:     { skin: '#f8e0c8', hair: '#80e0a0', style: 'long', hat: 'tiara', body: '#a0e0f0', trim: '#ffffff', robe: true, wings: '#e0f8ff' },
    alchemist: { skin: '#f0c090', hair: '#4a3020', hat: 'hood', hatc: '#4a7a40', body: '#4a7a40', trim: '#c0a060', robe: true, weapon: 'flask' },
    rogue:     { skin: '#e8b890', hair: '#2a2a2a', hat: 'hood', hatc: '#3a3a3a', body: '#4a4a4a', trim: '#8a5a2a', legs: '#3a3020', boots: '#2a2018', weapon: 'dagger' },
    mercenary: { skin: '#d8a070', hair: '#2a1a10', beard: '#2a1a10', body: '#6a5a40', trim: '#3a2a1a', legs: '#4a3a2a', boots: '#2a1a10', weapon: 'sword' },
    bard:      { skin: '#f0c090', hair: '#c08030', hat: 'cap', hatc: '#2a8a50', body: '#2a8a50', trim: '#e8c040', legs: '#7a3a2a', boots: '#4a2a1a', weapon: 'lute' },
    seer:      { skin: '#f0c090', hair: '#202040', style: 'long', hat: 'hood', hatc: '#402060', body: '#402060', trim: '#e8c040', robe: true },
    astro:     { skin: '#f0c090', hair: '#e0e0e0', beard: '#e0e0e0', hat: 'wizard', hatc: '#20306a', body: '#20306a', trim: '#e8e080', robe: true, weapon: 'staff', orb: '#f0f080' },
    merchant:  { skin: '#f0c090', hair: '#6a4020', hat: 'cap', hatc: '#a06a30', body: '#c0a070', trim: '#6a4020', legs: '#5a4a3a', boots: '#3a2a1a' },
    fisher:    { skin: '#c88a60', hair: '#3a2a20', beard: '#3a2a20', hat: 'cap', hatc: '#e0d0a0', body: '#3a6a9a', trim: '#e0d0a0', legs: '#4a4a5a', boots: '#2a2a30', weapon: 'spear' },
    child:     { skin: '#f6d0a8', hair: '#a06030', body: '#e05a5a', trim: '#ffffff', legs: '#4a6a9a', boots: '#3a2a20', small: true },
    valkyrie:  { skin: '#f6d0a8', hair: '#f0e0a0', style: 'long', hat: 'helm', metal: '#e0e4f0', wingHelm: true, body: '#c0c8d8', trim: '#3a60b0', legs: '#3a60b0', boots: '#8a6a3a', weapon: 'spear', shield: '#3a60b0' },
    elf:       { skin: '#f6d8b8', hair: '#e8d070', style: 'long', ears: 'pointy', body: '#3a7a3a', trim: '#8a6a3a', legs: '#4a5a3a', boots: '#5a3a20', weapon: 'bow' },
    samurai:   { skin: '#f0c090', hair: '#1a1a1a', style: 'pony', body: '#f0ece0', trim: '#b83a30', legs: '#2a3050', boots: '#3a2a20', weapon: 'sword', metal: '#c8ccd8' },   // 仮（後ろ姿の絵が無いとき。2D の正面・横・戦闘は assets/hero/samurai_*）。傭兵は村人の後ろ姿の絵がある
    // 人型の敵（鬼と、溶岩の魔人）
    imp:       { skin: '#8aa060', hair: '#2a2a20', style: 'bald', hat: 'horns', horn: '#f0e0c0', tusks: true, eye: '#f0e020', body: '#a07a40', trim: '#5a3a20', legs: '#8aa060', boots: '#5a3a20', weapon: 'club', small: true },
    hunter:    { skin: '#8a7aa0', hair: '#2a2030', style: 'long', hat: 'horns', horn: '#f0e0c0', eye: '#f0e020', body: '#4a5a3a', trim: '#8a6a3a', legs: '#3a3a2a', boots: '#2a2018', cape: '#3a2a20', weapon: 'bow' },
    redoni:    { skin: '#d04030', hair: '#2a1a10', hat: 'horns', horn: '#f0e0c0', tusks: true, eye: '#f0e020', body: '#e0b030', trim: '#2a1a10', stripes: '#2a1a10', legs: '#d04030', boots: '#d04030', weapon: 'kanabo', big: 1.15 },
    blueoni:   { skin: '#3a70c0', hair: '#1a1a2a', style: 'long', hat: 'horns', horn: '#f0e0c0', tusks: true, eye: '#f0e020', body: '#6a3a8a', trim: '#e0c040', robe: true, weapon: 'spear', metal: '#c8ccd8', big: 1.15 },
    golem:     { skin: '#4a3a3a', hair: null, style: 'bald', eye: '#ffb030', body: '#5a4040', trim: '#ff7020', cracks: '#ff7020', legs: '#4a3a3a', boots: '#3a2a2a', big: 1.45 },
    gatekeeper:{ skin: '#a05a40', hair: '#2a1a10', hat: 'horns', horn: '#f0e0c0', tusks: true, eye: '#f0e020', body: '#6a6a7a', trim: '#e0c040', legs: '#a05a40', boots: '#3a2a2a', weapon: 'kanabo', shield: '#6a3a2a', big: 1.6 },
    oniking:   { skin: '#c03a30', hair: '#2a1a1a', style: 'long', hat: 'horns', horn: '#f0e0c0', crown: true, tusks: true, eye: '#f0e020', body: '#2a2a3a', trim: '#e8c040', robe: true, cape: '#5a1a6a', weapon: 'kanabo', big: 1.9 },
  };

  // ---- 獣や魔物（文字の格子。. は透明） ----
  const GRID = {
    crab: { pal: { a: '#c84a30', b: '#e88a60', w: '#ffffff', k: '#202020' }, rows: [
      'aa..............aa',
      'aaa............aaa',
      '.aa..w......w..aa.',
      '..a..k......k..a..',
      '..aa.a......a.aa..',
      '...aaaaaaaaaaaa...',
      '..aabbbbbbbbbbaa..',
      '.aaabbbbbbbbbbaaa.',
      '.a.aaaaaaaaaaaa.a.',
      'a..a.a.a..a.a.a..a',
      '...a.a.a..a.a.a...' ] },
    seasnake: { pal: { a: '#2a8a8a', b: '#9ae0c0', r: '#f03030', k: '#f0e020', f: '#e0f0f0' }, rows: [
      '..aaaa..........',
      '.akaaaa.........',
      'aaaaaaaa........',
      'rraaaaaa........',
      '.r..bbaaa.......',
      '.....baaa.......',
      '......baaa......',
      '.......baaa.....',
      '..f....baaa.....',
      '.ff...baaa......',
      'ff...baaa..ff...',
      '.aaaaaaa..ff....',
      '..aaaaaaaaa.....' ] },
    lizard: { pal: { a: '#8a8a6a', b: '#b0b090', k: '#f0a020', r: '#e04040' }, rows: [
      '...aaa..............',
      '..akaaa.............',
      '.aaaaaaa............',
      'rr.aaaaaaaaaaa......',
      '...bbbaaaaaaaaaa....',
      '...a.a..aaaaaaaaaa..',
      '..aa.aa.a.a.....aaa.',
      '.........aa.......aa' ] },
    crow: { pal: { a: '#2a2a3a', b: '#4a4a6a', k: '#f03030', y: '#e0b030' }, rows: [
      '.....aaa..........',
      '....akaaa.........',
      '..yyaaaaa.........',
      '....aaaaab........',
      '...aaaaaabbb......',
      '..aaaaaaabbbbb....',
      '.aaaaaaaabbbbbbb..',
      '..aaaaaaaaaabbbbbb',
      '....aaaaaaa.......',
      '.....y..y.........',
      '....yy.yy.........' ] },
    mushroom: { pal: { a: '#a03a8a', b: '#f0d0f0', w: '#f0f0e0', k: '#202020', g: '#c0e060' }, rows: [
      '...aaaaaaaa...',
      '.aaabbaaaabaa.',
      'aabbbaaaaaaaaa',
      'aaaaaaabbaaaaa',
      'aaaaaaaaaaaaaa',
      '....wwwwww....',
      '....wkwwkw....',
      '....wwwwww....',
      '...wwwkkwww...',
      'g..wwwwwwww..g',
      '.g.wwwwwwww.g.',
      '...ww....ww...' ] },
    onibi: { pal: { y: '#f08020', w: '#fff0a0', b: '#c02010', r: '#f0c040' }, rows: [
      '.......y......',
      '......yy...y..',
      '..y..yrry.yy..',
      '..yy.yrrryy...',
      '...yyrwwwryy..',
      '..yrrwwwwwrry.',
      '.yrwwbwwbwwry.',
      '.yrwwwwwwwwry.',
      '.yrwwwbbwwwry.',
      '..yrwwwwwwry..',
      '...yrrrrrry...',
      '....yyyyyy....' ] },
    eagle: { pal: { a: '#6a4a2a', b: '#8a6a3a', w: '#f0f0e0', y: '#f0c020', k: '#202020' }, rows: [
      'aa....................aa',
      'aaa..................aaa',
      'abaa.......ww.......aaba',
      'abbaa.....wkww.....aabba',
      'abbbaa....wwyy....aabbba',
      '.abbbaa..wwwwy...aabbba.',
      '.abbbbaaaawwwwaaaabbbba.',
      '..abbbbaaaaaaaaaabbbba..',
      '...abbbaaaaaaaaaabbba...',
      '....aabaaaaaaaaaabaa....',
      '......a.aaaaaaa.a.......',
      '........aaaaaaa.........',
      '.........y....y.........',
      '........yy...yy.........' ] },
    cat: { pal: { a: '#e0a050', b: '#fff0d0', e: '#2a8a2a', k: '#f08080' }, rows: [
      '.a...a.....',
      '.aa.aa.....',
      '.aaaaa....a',
      '.eaaea....a',
      '.bakab...a.',
      '..bbaaaaaa.',
      '..aaaaaaaa.',
      '..a.a.a.a..' ] },
  };

  const GRID_SCALE = { eagle: 1.4, crab: 1.1 };   // 大きく見せる魔物
  const cache = new Map();

  function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = w + 2; c.height = h + 2; return c; }

  // 透明なところのうち、色のあるところに接している点を、ふちの色で塗る
  function outline(c) {
    const g = c.getContext('2d'), img = g.getImageData(0, 0, c.width, c.height), d = img.data, W = c.width, Hh = c.height;
    const solid = (x, y) => x >= 0 && y >= 0 && x < W && y < Hh && d[(y * W + x) * 4 + 3] > 0;
    const mark = [];
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) mark.push([x, y]);
    g.fillStyle = OUT; mark.forEach(([x, y]) => g.fillRect(x, y, 1, 1));
  }

  function drawGrid(def, flip) {
    const rows = def.rows, w = Math.max(...rows.map(r => r.length)), h = rows.length, c = canvasOf(w, h), g = c.getContext('2d');
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.') return;
      g.fillStyle = def.pal[ch] || '#f0f'; g.fillRect((flip ? w - 1 - x : x) + 1, y + 1, 1, 1);
    }));
    outline(c);
    return c;
  }

  // 人型：16×24 の格子に、後ろの部品から順に重ねる
  function drawHuman(s, view, frame) {
    const c = canvasOf(16, 24), g = c.getContext('2d');
    const P = (x, y, w, h, col) => { if (!col) return; g.fillStyle = col; g.fillRect(x + 1, y + 1, w, h); };
    const skin = s.skin, hair = s.hair, eye = s.eye || '#202030', metal = s.metal || '#c0c4d0';
    const step = frame === 1 ? 1 : frame === 2 ? -1 : 0;   // 歩き：脚を前後に
    const side = view === 'side', back = view === 'back';

    // 後ろの部品：羽、マント、持ち物（後ろ姿では体の陰）
    if (s.wings) { P(0, 7, 3, 7, s.wings); P(13, 7, 3, 7, s.wings); P(1, 6, 2, 1, s.wings); P(13, 6, 2, 1, s.wings); }
    if (s.cape && !back) side ? P(3, 8, 4, 13, s.cape) : P(3, 8, 10, 13, s.cape);
    if (back) drawWeapon(P, s, 'back', metal);

    // 脚と服
    if (s.robe) {
      side ? P(5, 8, 6, 14, s.body) : P(4, 8, 8, 14, s.body);
      side ? P(5, 20, 6, 2, s.trim) : P(4, 20, 8, 2, s.trim);
      if (step) { side ? P(6 + step * 2, 22, 3, 1, s.boots || OUT) : P(5, 22, 2, 1, s.boots || OUT); }
    } else {
      const legs = s.legs || s.body, boots = s.boots || legs;
      if (side) {
        if (step) { P(5, 16, 2, 5, legs); P(9, 16, 2, 5, legs); P(4, 21, 3, 2, boots); P(9, 21, 3, 2, boots); }
        else { P(6, 16, 4, 5, legs); P(6, 21, 5, 2, boots); }
      } else {
        const l = step > 0 ? -1 : 0, r = step < 0 ? -1 : 0;
        P(5, 16 + l, 3, 5, legs); P(8, 16 + r, 3, 5, legs); P(5, 21 + l, 3, 2, boots); P(8, 21 + r, 3, 2, boots);
      }
      side ? P(5, 8, 6, 8, s.body) : P(4, 8, 8, 8, s.body);
      side ? P(5, 14, 6, 1, s.trim) : P(4, 14, 8, 1, s.trim);
    }
    if (s.stripes && !s.robe) for (const y of [16, 18]) side ? P(6, y, 4, 1, s.stripes) : P(5, y, 6, 1, s.stripes);   // 虎の皮
    if (s.cracks) { P(6, 10, 1, 3, s.cracks); P(7, 12, 2, 1, s.cracks); P(9, 9, 1, 2, s.cracks); P(6, 18, 1, 2, s.cracks); P(9, 17, 1, 2, s.cracks); }
    // 腕
    const arm = s.body;
    if (side) { const a = step > 0 ? 1 : step < 0 ? -1 : 0; P(7 + a, 9, 2, 5, arm); P(7 + a, 14, 2, 1, skin); }
    else { P(2, 9, 2, 5, arm); P(12, 9, 2, 5, arm); P(2, 14, 2, 1, skin); P(12, 14, 2, 1, skin); }
    if (s.cape && back) P(3, 8, 10, 13, s.cape);

    // 頭
    if (side) P(6, 2, 6, 6, skin); else P(5, 2, 6, 6, skin);
    if (s.ears === 'pointy' && !side) { P(3, 3, 2, 1, skin); P(4, 4, 1, 1, skin); P(11, 3, 2, 1, skin); P(11, 4, 1, 1, skin); }
    if (s.ears === 'pointy' && side) { P(5, 3, 1, 2, skin); P(4, 2, 1, 1, skin); }
    const st = s.style || 'short';
    if (back) {
      if (hair && st !== 'bald') P(5, 1, 6, 6, hair); else P(5, 2, 6, 5, skin);
      if (hair && (st === 'long')) P(5, 7, 6, 3, hair);
      if (st === 'pony') P(7, 7, 2, 4, hair);
    } else if (side) {
      if (hair && st !== 'bald') { P(6, 1, 6, 2, hair); P(6, 2, 2, 4, hair); }
      if (hair && st === 'long') P(5, 3, 2, 7, hair);
      if (hair && st === 'pony') { P(4, 3, 2, 2, hair); P(3, 4, 2, 4, hair); }
      P(10, 4, 1, 1, eye); P(12, 5, 1, 1, skin);
      if (s.beard) P(8, 6, 4, 2, s.beard);
      if (s.tusks) P(11, 7, 1, 1, '#ffffff');
    } else {
      if (hair && st !== 'bald') { P(5, 1, 6, 2, hair); P(4, 2, 1, 3, hair); P(11, 2, 1, 3, hair); }
      if (hair && st === 'long') { P(4, 2, 1, 8, hair); P(11, 2, 1, 8, hair); }
      if (hair && st === 'pony') { P(11, 2, 2, 2, hair); P(12, 3, 2, 5, hair); }
      P(6, 4, 1, 1, eye); P(9, 4, 1, 1, eye);
      if (s.beard) { P(5, 6, 6, 2, s.beard); P(7, 6, 2, 1, skin); }
      if (s.tusks) { P(6, 7, 1, 1, '#ffffff'); P(9, 7, 1, 1, '#ffffff'); }
    }
    drawHat(P, s, view);
    if (!back) drawWeapon(P, s, view, metal);
    if (s.shield && !back) side ? P(9, 9, 3, 5, s.shield) : P(0, 9, 4, 6, s.shield);
    if (s.shield && !back && !side) P(1, 11, 2, 2, s.trim);
    outline(c);
    return c;
  }

  function drawHat(P, s, view) {
    const side = view === 'side', x = side ? 6 : 5;
    switch (s.hat) {
      case 'helm': P(x - 1, 0, 8, 3, s.metal || '#c0c4d0'); P(x - 1, 3, 1, 3, s.metal || '#c0c4d0'); if (!side) P(x + 6, 3, 1, 3, s.metal || '#c0c4d0');
        if (s.wingHelm) { P(x - 3, 0, 2, 2, '#ffffff'); if (!side) P(x + 7, 0, 2, 2, '#ffffff'); } break;
      case 'hood': P(x - 1, 0, 8, 3, s.hatc); P(x - 1, 3, 1, 5, s.hatc); if (!side) P(x + 6, 3, 1, 5, s.hatc); else P(x, 3, 1, 4, s.hatc); break;
      case 'wizard': P(x + 2, 0, 2, 1, s.hatc); P(x + 1, 1, 4, 1, s.hatc); P(x - 2, 2, 10, 1, s.hatc); if (!side) P(x - 1, 2, 8, 1, s.trim); break;
      case 'cap': P(x, 0, 6, 2, s.hatc); P(side ? x + 4 : x - 1, 2, side ? 3 : 8, 1, s.hatc); break;
      case 'band': P(x, 2, 6, 1, s.hatc); if (!side) P(x + 6, 3, 2, 1, s.hatc); else P(x - 2, 3, 2, 1, s.hatc); break;
      case 'tiara': P(x + 1, 1, 4, 1, '#f0d060'); P(x + 2, 0, 2, 1, '#60c0f0'); break;
      case 'crown': P(x, 0, 6, 2, '#f0d060'); P(x + 1, 0, 1, 1, '#e03050'); P(x + 4, 0, 1, 1, '#3060e0'); break;
      case 'horns': P(x - 1, 0, 1, 3, s.horn); if (!side) P(x + 6, 0, 1, 3, s.horn); else P(x + 4, 0, 1, 2, s.horn);
        if (s.crown) P(x + 1, 0, 4, 2, '#f0d060'); break;
    }
  }

  function drawWeapon(P, s, view, metal) {
    const side = view === 'side', back = view === 'back', x = side ? 11 : back ? 1 : 14;
    const wood = '#8a5a2a';
    switch (s.weapon) {
      case 'sword': P(x, 2, 1, 10, metal); P(x - 1, 12, 3, 1, s.trim || '#e8c040'); P(x, 13, 1, 2, wood); break;
      case 'dagger': P(x, 9, 1, 4, metal); P(x - 1, 13, 3, 1, s.trim); P(x, 14, 1, 1, wood); break;
      case 'staff': P(x, 3, 1, 19, wood); if (s.orb !== null) P(x - 1, 0, 3, 3, s.orb || '#60c0f0'); else P(x - 1, 2, 2, 1, wood); break;
      case 'mace': P(x, 8, 1, 7, wood); P(x - 1, 5, 3, 3, metal); break;
      case 'club': P(x - 1, 3, 2, 11, wood); P(x - 1, 3, 3, 4, '#6a4020'); break;
      case 'kanabo': P(x, 10, 1, 5, wood); P(x - 1, 1, 3, 9, '#5a5a6a'); for (const y of [2, 4, 6, 8]) P(x - 2 + (y % 4 ? 0 : 4), y, 1, 1, '#c8ccd8'); break;   // 金棒
      case 'spear': P(x, 3, 1, 19, wood); P(x - 1, 0, 3, 1, metal); P(x, 0, 1, 3, metal); break;
      case 'axe': P(x, 4, 1, 11, wood); P(x - 2, 4, 2, 4, metal); break;
      case 'lute': if (!back) { P(side ? 9 : 10, 10, 4, 4, '#c08040'); P(side ? 12 : 13, 7, 1, 4, wood); } break;
      case 'bow': P(x, 4, 1, 12, wood); P(x - 1, 4, 1, 1, wood); P(x - 1, 15, 1, 1, wood); break;
      case 'flask': if (!back) { P(x - 1, 11, 3, 3, '#60e0a0'); P(x, 10, 1, 1, '#e0e0e0'); } break;
    }
  }

  // id の絵。view：front | side | back、frame：0〜2
  // id の絵。本番の敵の絵（assets/enemy/、tools/build_enemy_art.py が作る）があれば、正面はそれを使う。
  // そのときは canvas が無く url だけ。scale は仮の絵と同じ大きさで出るように、rows（仮の絵の何行ぶんか）から決める
  // 主人公の本番の絵（assets/hero/、tools/build_hero_art.py が作る）は、manifest に載っている向きだけ使う。
  // 後ろ姿は 0＝立ち、1・2＝左右の足。右向きは立ちと歩きの2コマなので、frame 2（もう片足）は立ちを出す（歩き・立ちを交互に）
  const ART = root.RQ.enemyArt || {}, HERO = root.RQ.heroArt || {}, NPC = root.RQ.npcArt || {};
  const heroFile = (view, frame) => view === 'side' ? [0, 1, 0][frame] || 0 : view === 'front' ? 0 : frame;
  // variant（1〜3）：主人公の正面の色違い（assets/hero/<ID>_front_0_v<n>.png。tools/hero_variants_2d.py。2026-11-10 ユーザー判断 86A：
  // ペースメーカー・旅人の 2D の顔を、3D の色違い〔game/herocolors.js〕とそろえる）。絵が無ければ元の色
  const VAR = root.RQ.heroVariants || {};
  function get(id, view = 'front', frame = 0, variant = 0) {
    if (variant && view === 'front' && HERO[id] && HERO[id].front && variant <= (VAR[id] || 0)) {
      const key = `${id}/front/v${variant}`;
      if (!cache.has(key)) { const f = HERO[id].front; cache.set(key, { canvas: null, url: `../assets/hero/${id}_front_0_v${variant}.png`, w: f.w, h: f.h, scale: HERO[id].rows / (f.body || f.h) }); }
      return cache.get(key);
    }
    const key = `${id}/${view}/${frame}`;
    if (cache.has(key)) return cache.get(key);
    const la = view === 'left' && ART[id] && ART[id].side;   // 敵の左向き（戦闘を横から見る形）。絵が無い敵は正面の絵
    if (la) { const out = { canvas: null, url: `../assets/enemy/${id}_left.png`, w: la.w, h: la.h, scale: ART[id].rows / la.h }; cache.set(key, out); return out; }
    if (view === 'left') { const out = get(id, 'front', frame); cache.set(key, out); return out; }
    const a = view === 'front' && ART[id];
    if (a) { const out = { canvas: null, url: `../assets/enemy/${id}.png`, w: a.w, h: a.h, scale: a.rows / a.h }; cache.set(key, out); return out; }
    const na = view === 'front' && !(HERO[id] && HERO[id].front) && NPC[id];   // NPC と女王の正面（assets/npc/。tools/build_object_art.py）。主人公は主人公の絵（assets/hero）が先
    if (na) { const out = { canvas: null, url: `../assets/npc/${id}.png`, w: na.w, h: na.h, scale: na.rows / na.h }; cache.set(key, out); return out; }
    if (view === 'battle') {   // 主人公の戦闘ポーズ（右向き。0＝構え・1＝踏み込み・2＝振り抜き・3＝よろけ）。絵が無ければ右向きの立ち
      const ba = HERO[id] && HERO[id].battle;
      if (!ba) { const out = get(id, 'side', 0); cache.set(key, out); return out; }
      const out = { canvas: null, url: `../assets/hero/${id}_battle_${frame}.png`, w: ba.w, h: ba.h, scale: HERO[id].rows / (ba.body || ba.h) }; cache.set(key, out); return out;   // 大きさは体の高さ body が基準（武器を上げたコマで画面が大きくならず、歩く姿と体の大きさがそろう。2026-10-25 ユーザー判断。前は絵の高さが基準になっていた）
    }
    const ra = view === 'run' && HERO[id] && HERO[id].run;   // 主人公の走る後ろ姿（2026-10-24。4コマ。assets/hero/<ID>_run_<コマ>.png）。絵が無ければ後ろ姿の歩き
    if (view === 'run' && !ra) { const out = get(id, 'back', [0, 1, 0, 2][frame] || 0); cache.set(key, out); return out; }
    if (ra) { const out = { canvas: null, url: `../assets/hero/${id}_run_${frame}.png`, w: ra.w, h: ra.h, scale: HERO[id].rows / (ra.body || ra.h) }; cache.set(key, out); return out; }
    const nb = view === 'back' && NPC[id] && NPC[id].back;   // NPC の後ろ姿（旅人の見た目。0＝立ち・1＝左足・2＝右足。assets/npc/<ID>_back_<コマ>.png）
    if (nb) { const out = { canvas: null, url: `../assets/npc/${id}_back_${frame}.png`, w: nb.w, h: nb.h, scale: NPC[id].rows / (nb.body || nb.h) }; cache.set(key, out); return out; }
    const ha = HERO[id] && HERO[id][view];
    if (ha) { const out = { canvas: null, url: `../assets/hero/${id}_${view}_${heroFile(view, frame)}.png`, w: ha.w, h: ha.h, scale: HERO[id].rows / (ha.body || ha.h) }; cache.set(key, out); return out; }   // body があれば体の高さが基準（防御のコマ guard を戦闘のコマと同じ大きさに）
    let canvas, scale = 1;
    if (H[id]) { canvas = drawHuman(H[id], view, frame); scale = H[id].big || (H[id].small ? 0.8 : 1); }
    else if (GRID[id]) { canvas = drawGrid(GRID[id], view === 'side'); scale = GRID_SCALE[id] || 1; }   // 獣は左向きに描いてある。side（右向き）は反転
    else canvas = drawGrid({ pal: { a: '#888' }, rows: ['aaaa', 'a..a', 'a..a', 'aaaa'] });
    const out = { canvas, url: canvas.toDataURL(), w: canvas.width, h: canvas.height, scale };
    cache.set(key, out);
    return out;
  }
  const has = id => !!(H[id] || GRID[id]);
  const canRun = id => !!(HERO[id] && HERO[id].run);   // 走る後ろ姿の絵があるか
  // 後ろ姿の 2D の絵（assets/hero の back）があるか。無い人（2026-11-05 時点でエルフ・ワルキューレ・侍・傭兵）は、コードの仮の絵を 3D の島に出さない（view3d.js。ユーザー判断「1a」）
  const hasBack = id => !!(HERO[id] && HERO[id].back);

  // 歩きの動き（絵は 立ち・足・立ち・もう片足 の4コマ。コマの間は、体の弾み・つぶれ・傾きを連続で補う）。
  // cyc＝歩きの周回数（1周で4コマ。コマは 0・.25・.5・.75）。立ち＝高い、足を着く＝低い。返す値：h 0〜1（高さ）、sy・sx 板の伸び縮み、roll 傾き（ラジアン）
  function walkPose(cyc) {
    const h = 0.5 + 0.5 * Math.cos(4 * Math.PI * cyc), lo = 1 - h;
    return { h, sy: 1 - 0.05 * lo, sx: 1 + 0.03 * lo, roll: 0.06 * Math.sin(2 * Math.PI * cyc) };
  }

  root.RQ.sprites = { get, has, canRun, hasBack, walkPose };
})(window);
