// Algorithm library. Every algorithm is written for the yellowUp holding
// frame (yellow top, green front, white cross at the bottom) using face turns
// only, because the device model tracks U R F D L B turns with fixed centres.
// Wide/slice/rotation versions from the sources were rewritten as face-turn
// equivalents; tests/algorithms.test.mjs verifies every entry with the engine.
//
// Sources:
//   https://jperm.net/3x3/moves (notation), https://jperm.net/3x3/cfop
//   https://jperm.net/algs/2look/oll
//   https://jperm.net/algs/2look/pll
//   https://jperm.net/algs/pll (advanced PLL)
//   https://ruwix.com/the-rubiks-cube/how-to-solve-the-rubiks-cube-beginners-method/

export const FRAME = 'yellowUp';

export const CATEGORIES = [
  { id: 'current', name: 'روش فعلی', description: 'الگوریتم‌های روش مبتدی که الان با آن‌ها حل می‌کنی.' },
  { id: 'cross', name: 'کراس', description: 'ساخت کراس سفید در پایین با حرکت‌های کمتر.' },
  { id: 'f2l', name: 'F2L شهودی', description: 'جفت کردن گوشه و لبه و درج هم‌زمان آن‌ها.' },
  { id: 'oll2', name: 'OLL دومرحله‌ای', description: 'زرد کردن رویهٔ بالا در دو مرحله: لبه‌ها، سپس گوشه‌ها.' },
  { id: 'pll2', name: 'PLL دومرحله‌ای', description: 'چیدن لایهٔ آخر در دو مرحله: گوشه‌ها، سپس لبه‌ها.' },
  { id: 'advanced', name: 'پیشرفته (بعداً)', description: 'برای بعد از تسلط بر روش دومرحله‌ای.' },
];

// goal: predicate name from core/stages.mjs GOALS; keep: what the case must leave intact.
// pattern: declared case shape, checked against the engine in tests.
export const ALGORITHMS = [
  // ---- روش فعلی ----
  {
    id: 'cur-sexy', category: 'current', name: 'تریگر راست', nameEn: 'Sexy move', alg: "R U R' U'",
    alternatives: [], kind: 'trigger', order: 6, difficulty: 1, prerequisites: [], caseMask: { type: 'trigger' },
    description: 'پایهٔ درج گوشه‌های لایهٔ اول؛ شش بار تکرار، مکعب را به حالت اول برمی‌گرداند.',
    recognition: 'گوشهٔ سفید بالای جایگاهش در جلو-راست است؛ این تریگر را تکرار کن تا سر جایش بنشیند.',
  },
  {
    id: 'cur-left', category: 'current', name: 'تریگر چپ', nameEn: 'Left sexy', alg: "L' U' L U",
    alternatives: [], kind: 'trigger', order: 6, difficulty: 1, prerequisites: [], caseMask: { type: 'trigger' },
    description: 'قرینهٔ تریگر راست برای سمت چپ.',
    recognition: 'وقتی کار در جلو-چپ راحت‌تر است.',
  },
  {
    id: 'cur-sledge', category: 'current', name: 'اسلج‌همر', nameEn: 'Sledgehammer', alg: "R' F R F'",
    alternatives: [], kind: 'trigger', order: 6, difficulty: 1, prerequisites: [], caseMask: { type: 'trigger' },
    description: 'تریگر کمکی؛ در F2L و OLL زیاد دیده می‌شود.',
    recognition: 'بخشی از الگوریتم‌های بلندتر.',
  },
  {
    id: 'cur-edge-right', category: 'current', name: 'لبهٔ لایهٔ دوم به راست', nameEn: 'Second layer edge right',
    alg: "U R U' R' U' F' U F", alternatives: [], goal: 'f2l', keep: 'firstLayer', difficulty: 1, prerequisites: ['cur-sexy'],
    caseMask: { type: 'f2l', slot: 'FR' }, pattern: { slot: 'FR', edgeOnly: true },
    description: 'لبهٔ بدون زرد را از لایهٔ بالا به جایگاه جلو-راست می‌برد و لایهٔ اول را حفظ می‌کند.',
    recognition: 'رنگ جلوی لبه با مرکز جلو جور است و رنگ بالایش با مرکز راست.',
  },
  {
    id: 'cur-edge-left', category: 'current', name: 'لبهٔ لایهٔ دوم به چپ', nameEn: 'Second layer edge left',
    alg: "U' L' U L U F U' F'", alternatives: [], goal: 'f2l', keep: 'firstLayer', difficulty: 1, prerequisites: ['cur-left'],
    caseMask: { type: 'f2l', slot: 'FL' }, pattern: { slot: 'FL', edgeOnly: true },
    description: 'قرینهٔ درج راست؛ لبه را به جایگاه جلو-چپ می‌برد.',
    recognition: 'رنگ جلوی لبه با مرکز جلو جور است و رنگ بالایش با مرکز چپ.',
  },
  {
    id: 'cur-yellow-cross', category: 'current', name: 'صلیب زرد', nameEn: 'Yellow cross', alg: "F R U R' U' F'",
    alternatives: [], goal: 'llEdgesOriented', keep: 'f2l', difficulty: 1, prerequisites: ['cur-sexy'],
    caseMask: { type: 'oll' }, pattern: { badEdges: ['UF', 'UB'] },
    description: 'لبه‌های زرد را رو به بالا می‌کند: نقطه ← L ← خط ← صلیب.',
    recognition: 'خط افقی زرد را چپ به راست نگه دار؛ برای L آن را پشت-چپ بگذار و دو بار اجرا کن.',
  },
  {
    id: 'cur-edge-swap', category: 'current', name: 'جابه‌جایی لبه‌های زرد', nameEn: 'Yellow edge swap',
    alg: "R U R' U R U2 R' U", alternatives: [], goal: 'llEdges', keep: 'f2l', difficulty: 1, prerequisites: ['cur-yellow-cross'],
    caseMask: { type: 'pll' }, pattern: { swappedEdges: ['UF', 'UL'] },
    description: 'دو لبهٔ زرد مجاور (جلو و چپ) را جابه‌جا می‌کند؛ گوشه‌ها ممکن است عوض شوند.',
    recognition: 'دو لبهٔ درست را پشت و راست نگه دار؛ لبه‌های جلو و چپ جابه‌جا می‌شوند.',
  },
  {
    id: 'cur-corner-cycle', category: 'current', name: 'چرخش جای گوشه‌های زرد', nameEn: 'Yellow corner cycle',
    alg: "U R U' L' U R' U' L", alternatives: [], goal: 'cornersPlaced', keep: 'f2l', difficulty: 1, prerequisites: ['cur-edge-swap'],
    caseMask: { type: 'pll' }, pattern: { cornersMoved: 3, edgesMoved: 0 },
    description: 'سه گوشهٔ زرد را جابه‌جا می‌کند و گوشهٔ جلو-راست بالا را ثابت نگه می‌دارد.',
    recognition: 'گوشه‌ای که سر جایش است (جهتش مهم نیست) را جلو-راست بالا بگذار.',
  },
  {
    id: 'cur-corner-twist', category: 'current', name: 'چرخاندن گوشهٔ زرد', nameEn: 'Corner twist',
    alg: "R' D' R D", alternatives: [], kind: 'trigger', order: 6, difficulty: 1, prerequisites: ['cur-corner-cycle'],
    caseMask: { type: 'trigger' },
    description: 'گوشهٔ جلو-راست بالا را می‌چرخاند؛ دو یا چهار بار تا زرد رو به بالا شود. لایه‌های پایین موقتاً به‌هم می‌ریزند.',
    recognition: 'فقط لایهٔ بالا را بین گوشه‌ها بچرخان، نه کل مکعب را.',
  },

  // ---- کراس ----
  {
    id: 'cross-short', category: 'cross', name: 'کراس کوتاه', nameEn: 'Short cross', alg: '', alternatives: [],
    practice: { type: 'cross', minMoves: 2, maxMoves: 4 }, difficulty: 1, prerequisites: [], caseMask: { type: 'cross' },
    description: 'کراس‌هایی که در ۲ تا ۴ حرکت حل می‌شوند؛ برای دیدن مسیر بهینه پیش از چرخاندن.',
    recognition: 'هر چهار لبهٔ سفید را پیدا کن و قبل از شروع، کل مسیر را در ذهن مرور کن.',
  },
  {
    id: 'cross-mid', category: 'cross', name: 'کراس متوسط', nameEn: 'Medium cross', alg: '', alternatives: [],
    practice: { type: 'cross', minMoves: 5, maxMoves: 6 }, difficulty: 2, prerequisites: ['cross-short'], caseMask: { type: 'cross' },
    description: 'کراس‌های ۵ تا ۶ حرکتی؛ اغلب حل‌های واقعی همین‌اند.',
    recognition: 'دو لبه را با هم حل کن و از حرکت‌های اضافهٔ لایهٔ پایین پرهیز کن.',
  },
  {
    id: 'cross-full', category: 'cross', name: 'کراس دشوار', nameEn: 'Hard cross', alg: '', alternatives: [],
    practice: { type: 'cross', minMoves: 7, maxMoves: 8 }, difficulty: 3, prerequisites: ['cross-mid'], caseMask: { type: 'cross' },
    description: 'کراس‌های ۷ و ۸ حرکتی؛ هدف حداکثر ۸ حرکت است.',
    recognition: 'اگر لبه‌ای در لایهٔ پایین برعکس است، اول آن را با یک حرکت به لایهٔ میانی ببر.',
  },

  // ---- F2L شهودی (جایگاه جلو-راست) ----
  {
    id: 'f2l-1', category: 'f2l', name: 'درج ساده از راست', nameEn: 'Basic insert right', alg: "U R U' R'",
    alternatives: ["R' F R F'"], goal: 'f2l', keep: 'otherSlots', difficulty: 1, prerequisites: [], caseMask: { type: 'f2l', slot: 'FR' },
    pattern: { corner: ['URF', 'F'], edge: ['UR', 'U'] },
    description: 'U جفت را بالای جایگاه کنار هم می‌آورد و R U\' R\' هر دو را با هم درج می‌کند.',
    recognition: 'گوشه بالای جایگاه، سفید رو به جلو؛ لبه بالا-راست و رنگ جلو رو به بالا.',
  },
  {
    id: 'f2l-2', category: 'f2l', name: 'درج ساده از جلو', nameEn: 'Basic insert front', alg: "U' F' U F",
    alternatives: [], goal: 'f2l', keep: 'otherSlots', difficulty: 1, prerequisites: [], caseMask: { type: 'f2l', slot: 'FR' },
    pattern: { corner: ['URF', 'R'], edge: ['UF', 'F'] },
    description: 'قرینهٔ درج راست با دست چپ روی وجه جلو.',
    recognition: 'گوشه بالای جایگاه، سفید رو به راست؛ لبه بالا-جلو.',
  },
  {
    id: 'f2l-3', category: 'f2l', name: 'درج مستقیم راست', nameEn: 'Direct insert right', alg: "R U R'",
    alternatives: [], goal: 'f2l', keep: 'otherSlots', difficulty: 1, prerequisites: [], caseMask: { type: 'f2l', slot: 'FR' },
    pattern: { corner: ['URF', 'R'], edge: ['UB', 'U'] },
    description: 'گوشه و لبه در یک ردیف‌اند؛ فقط سه حرکت.',
    recognition: 'گوشه بالای جایگاه با سفید رو به راست؛ لبه پشت لایهٔ بالا.',
  },
  {
    id: 'f2l-4', category: 'f2l', name: 'درج مستقیم جلو', nameEn: 'Direct insert front', alg: "F' U' F",
    alternatives: [], goal: 'f2l', keep: 'otherSlots', difficulty: 1, prerequisites: [], caseMask: { type: 'f2l', slot: 'FR' },
    pattern: { corner: ['URF', 'F'], edge: ['UL', 'L'] },
    description: 'قرینهٔ درج مستقیم برای وجه جلو.',
    recognition: 'گوشه بالای جایگاه با سفید رو به جلو؛ لبه بالا-چپ.',
  },
  {
    id: 'f2l-5', category: 'f2l', name: 'جفت جدا، ساختن جفت (راست)', nameEn: 'Split pair right', alg: "U' R U' R' U R U R'",
    alternatives: [], goal: 'f2l', keep: 'otherSlots', difficulty: 2, prerequisites: ['f2l-1'], caseMask: { type: 'f2l', slot: 'FR' },
    pattern: { corner: ['URF', 'R'], edge: ['UR', 'U'] },
    description: 'گوشه و لبه کنار هم‌اند ولی جفت نمی‌شوند؛ اول جدا و دوباره جفتشان کن، سپس درج.',
    recognition: 'گوشه بالای جایگاه، سفید رو به راست؛ لبه بالا-راست.',
  },
  {
    id: 'f2l-6', category: 'f2l', name: 'جفت جدا، ساختن جفت (جلو)', nameEn: 'Split pair front', alg: "U F' U F U' F' U' F",
    alternatives: [], goal: 'f2l', keep: 'otherSlots', difficulty: 2, prerequisites: ['f2l-2'], caseMask: { type: 'f2l', slot: 'FR' },
    pattern: { corner: ['URF', 'F'], edge: ['UF', 'F'] },
    description: 'قرینهٔ حالت قبل برای وجه جلو.',
    recognition: 'گوشه بالای جایگاه، سفید رو به جلو؛ لبه بالا-جلو.',
  },
  {
    id: 'f2l-7', category: 'f2l', name: 'گوشه در جایگاه، چرخیده', nameEn: 'Corner in slot twisted', alg: "R U' R' U R U' R'",
    alternatives: [], goal: 'f2l', keep: 'otherSlots', difficulty: 2, prerequisites: ['f2l-1'], caseMask: { type: 'f2l', slot: 'FR' },
    pattern: { corner: ['DFR', 'F'], edge: ['UR', 'U'] },
    description: 'گوشه پایین است ولی سفیدش رو به جلو؛ با بیرون‌آوردن و جفت‌کردن درست می‌شود.',
    recognition: 'گوشه در جایگاه با سفید رو به جلو؛ لبه بالا-راست.',
  },
  {
    id: 'f2l-8', category: 'f2l', name: 'لبه در جایگاه، سفید بالا', nameEn: 'Edge in slot, white up', alg: "R U R' U' R U R' U' R U R'",
    alternatives: [], goal: 'f2l', keep: 'otherSlots', difficulty: 2, prerequisites: ['f2l-3'], caseMask: { type: 'f2l', slot: 'FR' },
    pattern: { corner: ['URF', 'U'], edge: ['FR', 'F'] },
    description: 'لبه درست نشسته و گوشه با سفید رو به بالا؛ تریگر را تکرار کن تا گوشه بنشیند.',
    recognition: 'گوشه بالای جایگاه با سفید رو به بالا؛ لبه سر جایش.',
  },
  {
    id: 'f2l-9', category: 'f2l', name: 'لبه پشت، سفید جلو', nameEn: 'Edge back, white front', alg: "U' R U R' U2 R U' R'",
    alternatives: [], goal: 'f2l', keep: 'otherSlots', difficulty: 2, prerequisites: ['f2l-5'], caseMask: { type: 'f2l', slot: 'FR' },
    pattern: { corner: ['URF', 'F'], edge: ['UB', 'U'] },
    description: 'با R U R\' جفت ساخته می‌شود، با U2 جابه‌جا و سپس درج.',
    recognition: 'گوشه بالای جایگاه، سفید رو به جلو؛ لبه پشت لایهٔ بالا.',
  },
  {
    id: 'f2l-10', category: 'f2l', name: 'سفید بالا، لبه پشت', nameEn: 'White up, edge back', alg: "U R U2 R' U R U' R'",
    alternatives: [], goal: 'f2l', keep: 'otherSlots', difficulty: 3, prerequisites: ['f2l-8'], caseMask: { type: 'f2l', slot: 'FR' },
    pattern: { corner: ['URF', 'U'], edge: ['UB', 'U'] },
    description: 'سفید بالا یعنی اول گوشه را بچرخان تا سفیدش کنار شود، سپس جفت کن.',
    recognition: 'گوشه بالای جایگاه با سفید رو به بالا؛ لبه پشت لایهٔ بالا.',
  },
  {
    id: 'f2l-11', category: 'f2l', name: 'سفید بالا، لبه چپ', nameEn: 'White up, edge left', alg: "U' F' U2 F U' F' U F",
    alternatives: [], goal: 'f2l', keep: 'otherSlots', difficulty: 3, prerequisites: ['f2l-8'], caseMask: { type: 'f2l', slot: 'FR' },
    pattern: { corner: ['URF', 'U'], edge: ['UL', 'L'] },
    description: 'قرینهٔ حالت قبل روی وجه جلو.',
    recognition: 'گوشه بالای جایگاه با سفید رو به بالا؛ لبه بالا-چپ.',
  },
  {
    id: 'f2l-12', category: 'f2l', name: 'گوشه درست، لبه بالا', nameEn: 'Corner solved, edge up', alg: "R U' R' U' F' U F",
    alternatives: [], goal: 'f2l', keep: 'otherSlots', difficulty: 2, prerequisites: ['cur-edge-right'], caseMask: { type: 'f2l', slot: 'FR' },
    pattern: { corner: ['DFR', 'D'], edge: ['UL', 'L'] },
    description: 'گوشه درست نشسته؛ لبه را مثل لایهٔ دوم روش مبتدی، ولی کوتاه‌تر، درج کن.',
    recognition: 'گوشه سر جایش و درست؛ لبه بالا-چپ.',
  },

  // ---- OLL دومرحله‌ای ----
  {
    id: 'oll-dot', category: 'oll2', name: 'نقطه', nameEn: 'Dot', alg: "F R U R' U' F' U2 F U R U' R' F'",
    alternatives: [], goal: 'llEdgesOriented', keep: 'f2l', auf: true, difficulty: 1, prerequisites: ['oll-line', 'oll-l'],
    caseMask: { type: 'oll' }, pattern: { badEdges: ['UF', 'UR', 'UB', 'UL'] },
    description: 'هیچ لبهٔ زردی بالا نیست؛ ترکیب حالت خط و حالت L.',
    recognition: 'فقط مرکز زرد بالاست.',
  },
  {
    id: 'oll-line', category: 'oll2', name: 'خط', nameEn: 'Line', alg: "F R U R' U' F'",
    alternatives: [], goal: 'llEdgesOriented', keep: 'f2l', auf: true, difficulty: 1, prerequisites: [],
    caseMask: { type: 'oll' }, pattern: { badEdges: ['UF', 'UB'] },
    description: 'خط زرد افقی را به صلیب تبدیل می‌کند.',
    recognition: 'خط زرد را چپ به راست نگه دار.',
  },
  {
    id: 'oll-l', category: 'oll2', name: 'L', nameEn: 'L shape', alg: "F U R U' R' F'",
    alternatives: [], goal: 'llEdgesOriented', keep: 'f2l', auf: true, difficulty: 1, prerequisites: ['oll-line'],
    caseMask: { type: 'oll' }, pattern: { badEdges: ['UF', 'UR'] },
    description: 'شکل L زرد را مستقیم به صلیب می‌رساند (نسخهٔ بدون حرکت پهن).',
    recognition: 'L را پشت-چپ نگه دار.',
  },
  {
    id: 'oll-sune', category: 'oll2', name: 'سون', nameEn: 'Sune', alg: "R U R' U R U2 R'",
    alternatives: ["L' U2 L U L' U L"], goal: 'oll', keep: 'f2l', auf: true, difficulty: 1, prerequisites: [],
    caseMask: { type: 'oll' }, pattern: { yellow: { UFL: 'U', URF: 'F', UBR: 'R', ULB: 'B' } },
    description: 'یک گوشهٔ زرد بالا؛ معروف‌ترین الگوریتم OLL.',
    recognition: 'گوشهٔ زرد را جلو-چپ بگذار؛ زرد گوشهٔ جلو-راست رو به جلوست.',
  },
  {
    id: 'oll-antisune', category: 'oll2', name: 'آنتی‌سون', nameEn: 'Antisune', alg: "R U2 R' U' R U' R'",
    alternatives: ["L' U' L U' L' U2 L"], goal: 'oll', keep: 'f2l', auf: true, difficulty: 1, prerequisites: ['oll-sune'],
    caseMask: { type: 'oll' }, pattern: { yellow: { UFL: 'F', URF: 'R', UBR: 'U', ULB: 'L' } },
    description: 'یک گوشهٔ زرد بالا، جهت مخالف سون.',
    recognition: 'گوشهٔ زرد را پشت-راست بگذار؛ زرد گوشهٔ جلو-راست رو به راست است.',
  },
  {
    id: 'oll-h', category: 'oll2', name: 'H', nameEn: 'H (double Sune)', alg: "R U R' U R U' R' U R U2 R'",
    alternatives: ["F R U R' U' R U R' U' R U R' U' F'"], goal: 'oll', keep: 'f2l', auf: true, difficulty: 2, prerequisites: ['oll-sune'],
    caseMask: { type: 'oll' }, pattern: { yellow: { UFL: 'L', URF: 'R', UBR: 'R', ULB: 'L' } },
    description: 'هیچ گوشهٔ زردی بالا نیست و زردها دو به دو روبه‌روی هم‌اند.',
    recognition: 'زردهای گوشه را چپ و راست نگه دار.',
  },
  {
    id: 'oll-pi', category: 'oll2', name: 'Pi', nameEn: 'Pi', alg: "R U2 R2 U' R2 U' R2 U2 R",
    alternatives: [], goal: 'oll', keep: 'f2l', auf: true, difficulty: 2, prerequisites: ['oll-h'],
    caseMask: { type: 'oll' }, pattern: { yellow: { UFL: 'L', URF: 'F', UBR: 'B', ULB: 'L' } },
    description: 'هیچ گوشهٔ زردی بالا نیست؛ یک جفت چراغ و دو زرد مخالف.',
    recognition: 'چراغ‌ها (دو زرد هم‌جهت) را سمت چپ بگذار.',
  },
  {
    id: 'oll-u', category: 'oll2', name: 'U (چراغ جلو)', nameEn: 'U / Headlights', alg: "R2 D R' U2 R D' R' U2 R'",
    alternatives: [], goal: 'oll', keep: 'f2l', auf: true, difficulty: 2, prerequisites: ['oll-pi'],
    caseMask: { type: 'oll' }, pattern: { yellow: { UFL: 'F', URF: 'F', UBR: 'U', ULB: 'U' } },
    description: 'دو گوشهٔ زرد بالا در پشت؛ دو گوشهٔ جلو چراغ‌اند.',
    recognition: 'چراغ‌ها را جلو بگذار.',
  },
  {
    id: 'oll-t', category: 'oll2', name: 'T', nameEn: 'T', alg: "L F R' F' L' F R F'",
    alternatives: [], goal: 'oll', keep: 'f2l', auf: true, difficulty: 2, prerequisites: ['oll-u'],
    caseMask: { type: 'oll' }, pattern: { yellow: { UFL: 'F', URF: 'U', UBR: 'U', ULB: 'B' } },
    description: 'دو گوشهٔ زرد بالا در سمت راست؛ زرد دو گوشهٔ چپ رو به جلو و پشت.',
    recognition: 'گوشه‌های زرد بالا را راست بگذار. (نسخهٔ بدون حرکت پهن)',
  },
  {
    id: 'oll-lc', category: 'oll2', name: 'L گوشه‌ای', nameEn: 'L (corners)', alg: "F R' F' L F R F' L'",
    alternatives: [], goal: 'oll', keep: 'f2l', auf: true, difficulty: 3, prerequisites: ['oll-t'],
    caseMask: { type: 'oll' }, pattern: { yellow: { UFL: 'F', URF: 'U', UBR: 'R', ULB: 'U' } },
    description: 'دو گوشهٔ زرد بالا در قطر مکعب.',
    recognition: 'گوشه‌های زرد بالا جلو-راست و پشت-چپ؛ زرد گوشهٔ جلو-چپ رو به جلو. (نسخهٔ بدون حرکت پهن)',
  },

  // ---- PLL دومرحله‌ای ----
  {
    id: 'pll-t', category: 'pll2', name: 'T-perm (چراغ‌ها)', nameEn: 'T-perm', alg: "R U R' U' R' F R2 U' R' U' R U R' F'",
    alternatives: [], goal: 'pll', keep: 'oll', auf: true, difficulty: 2, prerequisites: [],
    caseMask: { type: 'pll' }, pattern: { cornersMoved: 2, cornerSwap: 'adjacent', edgesMoved: 2 },
    description: 'دو گوشهٔ مجاور را جابه‌جا می‌کند؛ در مرحلهٔ گوشه‌ها برای حالت چراغ.',
    recognition: 'دو گوشهٔ هم‌رنگ (چراغ) را سمت چپ بگذار.',
  },
  {
    id: 'pll-y', category: 'pll2', name: 'Y-perm (قطری)', nameEn: 'Y-perm', alg: "F R U' R' U' R U R' F' R U R' U' R' F R F'",
    alternatives: [], goal: 'pll', keep: 'oll', auf: true, difficulty: 2, prerequisites: ['pll-t'],
    caseMask: { type: 'pll' }, pattern: { cornersMoved: 2, cornerSwap: 'diagonal', edgesMoved: 2 },
    description: 'دو گوشهٔ قطری را جابه‌جا می‌کند؛ وقتی هیچ چراغی نیست.',
    recognition: 'در هیچ وجهی دو گوشهٔ هم‌رنگ نیست.',
  },
  {
    id: 'pll-ua', category: 'pll2', name: 'Ua', nameEn: 'Ua-perm', alg: "R U' R U R U R U' R' U' R2",
    alternatives: [], goal: 'pll', keep: 'oll', auf: true, difficulty: 1, prerequisites: [],
    caseMask: { type: 'pll' }, pattern: { cornersMoved: 0, edgesMoved: 3 },
    description: 'سه لبه را در جهت ساعت‌گرد (از بالا) جابه‌جا می‌کند.',
    recognition: 'ردیف کامل را پشت بگذار.',
  },
  {
    id: 'pll-ub', category: 'pll2', name: 'Ub', nameEn: 'Ub-perm', alg: "R2 U R U R' U' R' U' R' U R'",
    alternatives: [], goal: 'pll', keep: 'oll', auf: true, difficulty: 1, prerequisites: ['pll-ua'],
    caseMask: { type: 'pll' }, pattern: { cornersMoved: 0, edgesMoved: 3 },
    description: 'سه لبه را در جهت مخالف Ua جابه‌جا می‌کند.',
    recognition: 'ردیف کامل را پشت بگذار.',
  },
  {
    id: 'pll-h', category: 'pll2', name: 'H-perm', nameEn: 'H-perm', alg: "R2 U2 R U2 R2 U2 R2 U2 R U2 R2",
    alternatives: [], goal: 'pll', keep: 'oll', auf: true, difficulty: 2, prerequisites: ['pll-ua'],
    caseMask: { type: 'pll' }, pattern: { cornersMoved: 0, edgesMoved: 4, edgeSwap: 'opposite' },
    description: 'لبه‌های روبه‌رو را دو به دو جابه‌جا می‌کند (نسخهٔ بدون حرکت لایهٔ میانی).',
    recognition: 'هر چهار وجه رنگ لبهٔ مخالف دارند.',
  },
  {
    id: 'pll-z', category: 'pll2', name: 'Z-perm', nameEn: 'Z-perm', alg: "R' U' R U' R U R U' R' U R U R2 U' R' U",
    alternatives: [], goal: 'pll', keep: 'oll', auf: true, difficulty: 3, prerequisites: ['pll-h'],
    caseMask: { type: 'pll' }, pattern: { cornersMoved: 0, edgesMoved: 4, edgeSwap: 'adjacent' },
    description: 'لبه‌های مجاور را دو به دو جابه‌جا می‌کند (نسخهٔ بدون حرکت لایهٔ میانی).',
    recognition: 'لبهٔ هر وجه رنگ وجه کناری را دارد.',
  },

  // ---- پیشرفته ----
  {
    id: 'adv-aa', category: 'advanced', later: true, name: 'Aa-perm', nameEn: 'Aa-perm', alg: "R' F R' B2 R F' R' B2 R2",
    alternatives: [], goal: 'pll', keep: 'oll', auf: true, difficulty: 3, prerequisites: ['pll-t'],
    caseMask: { type: 'pll' }, pattern: { cornersMoved: 3, edgesMoved: 0 },
    description: 'سه گوشه را جابه‌جا می‌کند؛ کوتاه‌تر از روش مبتدی (نسخهٔ بدون چرخش کل مکعب).',
    recognition: 'یک ردیف کامل با چراغ‌ها؛ فقط گوشه‌ها جابه‌جا هستند.',
  },
  {
    id: 'adv-ab', category: 'advanced', later: true, name: 'Ab-perm', nameEn: 'Ab-perm', alg: "R2 B2 R F R' B2 R F' R",
    alternatives: [], goal: 'pll', keep: 'oll', auf: true, difficulty: 3, prerequisites: ['adv-aa'],
    caseMask: { type: 'pll' }, pattern: { cornersMoved: 3, edgesMoved: 0 },
    description: 'سه گوشه در جهت مخالف Aa.',
    recognition: 'مانند Aa ولی جهت مخالف.',
  },
  {
    id: 'adv-jb', category: 'advanced', later: true, name: 'Jb-perm', nameEn: 'Jb-perm', alg: "R U R' F' R U R' U' R' F R2 U' R'",
    alternatives: [], goal: 'pll', keep: 'oll', auf: true, difficulty: 3, prerequisites: ['pll-t'],
    caseMask: { type: 'pll' }, pattern: { cornersMoved: 2, cornerSwap: 'adjacent', edgesMoved: 2 },
    description: 'یک گوشه و یک لبهٔ مجاور را با هم جابه‌جا می‌کند.',
    recognition: 'بلوک ۱×۲×۳ کامل در سمت چپ.',
  },
  {
    id: 'adv-ja', category: 'advanced', later: true, name: 'Ja-perm', nameEn: 'Ja-perm', alg: "R' U L' U2 R U' R' U2 R L",
    alternatives: [], goal: 'pll', keep: 'oll', auf: true, difficulty: 3, prerequisites: ['adv-jb'],
    caseMask: { type: 'pll' }, pattern: { cornersMoved: 2, cornerSwap: 'adjacent', edgesMoved: 2 },
    description: 'قرینهٔ Jb.',
    recognition: 'بلوک کامل در سمت مقابل Jb.',
  },
  {
    id: 'adv-f', category: 'advanced', later: true, name: 'F-perm', nameEn: 'F-perm', alg: "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R",
    alternatives: [], goal: 'pll', keep: 'oll', auf: true, difficulty: 3, prerequisites: ['pll-t'],
    caseMask: { type: 'pll' }, pattern: { cornersMoved: 2, cornerSwap: 'adjacent', edgesMoved: 2 },
    description: 'دو گوشه و دو لبهٔ روبه‌رو را جابه‌جا می‌کند.',
    recognition: 'یک وجه کاملاً یک‌رنگ و چراغ‌ها در وجه مقابل.',
  },
];

export const ALGORITHM_BY_ID = Object.fromEntries(ALGORITHMS.map((a) => [a.id, a]));
