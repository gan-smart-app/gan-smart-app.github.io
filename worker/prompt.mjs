// Fixed, versioned instructions and input/output contracts for the optional
// Claude analysis. Bump PROMPT_VERSION whenever SYSTEM_PROMPT, TASKS or
// OUTPUT_SCHEMA change, so cached answers from older instructions are not reused.

export const PROMPT_VERSION = 'p1';

export const SYSTEM_PROMPT = [
  'تو مربی تمرین روبیک ۳×۳ برای یک کاربر شخصی هستی.',
  'روش و سطح کاربر در داده آمده است؛ آن را مبنا بگیر و او را مسلط به CFOP فرض نکن.',
  'فقط از داده‌های داده‌شده نتیجه بگیر. عدد، رکورد یا روند نساز؛ اگر داده کافی نیست صریح بگو.',
  'زمان‌ها بر پایهٔ دریافت حرکت در مرورگرند و دقت مسابقه‌ای ندارند؛ دربارهٔ مکث یا زمان دقیق مراحل ادعا نکن.',
  'پاسخ فارسی، کوتاه، دلگرم‌کننده ولی بی‌اغراق و عملی باشد.',
  "هر توالی حرکت را فقط با نماد استاندارد (مثل R U R' U2) و فقط در فیلد algorithms بنویس؛ برنامه آن را جداگانه بررسی می‌کند.",
].join('\n');

export const TASKS = {
  session: { required: ['sessionId'], ask: 'این خلاصهٔ آماری یک جلسهٔ تمرین پایان‌یافته است. وضعیت جلسه، نکته‌های اصلی و چند پیشنهاد تمرین بعدی بده.' },
  solve: { required: ['solveId'], ask: 'این اطلاعات یک حل است. اگر سؤالی در داده هست به آن پاسخ بده؛ وگرنه نکته‌های قابل استفاده از همین حل را بگو.' },
  'lesson-question': { required: ['lessonId', 'question'], ask: 'کاربر دربارهٔ همین درس سؤال دارد. فقط در محدودهٔ همین درس پاسخ بده.' },
  plan: { required: ['level'], ask: 'بر اساس این خلاصهٔ پیشرفت، یک برنامهٔ یادگیری و تمرین کوتاه برای روزهای آینده پیشنهاد بده.' },
};

export const DETAIL = {
  short: { maxTokens: 800, hint: 'پاسخ مختصر باشد.' },
  long: { maxTokens: 2000, hint: 'کاربر توضیح مفصل‌تر خواسته است؛ همچنان متمرکز بمان.' },
};

export const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'points', 'suggestions', 'algorithms'],
  properties: {
    summary: { type: 'string' },
    points: { type: 'array', items: { type: 'string' } },
    suggestions: { type: 'array', items: { type: 'string' } },
    algorithms: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'moves', 'note'],
        properties: { name: { type: 'string' }, moves: { type: 'string' }, note: { type: 'string' } },
      },
    },
  },
};

const LIMITS = { depth: 4, keys: 40, items: 60, string: 600 };

// Payloads are summaries computed by the app; anything shaped differently is
// rejected rather than truncated, so the model never sees unexpected data.
export function validatePayload(type, payload, maxChars) {
  const task = TASKS[type];
  if (!task) return 'نوع درخواست پشتیبانی نمی‌شود.';
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 'دادهٔ ارسالی باید یک شیء باشد.';
  for (const k of task.required) {
    if (payload[k] === undefined || payload[k] === null || payload[k] === '') return `فیلد لازم «${k}» ارسال نشده است.`;
  }
  const bad = checkShape(payload, 0);
  if (bad) return bad;
  if (canonicalJson(payload).length > maxChars) return 'دادهٔ ارسالی از سقف مجاز بزرگ‌تر است.';
  return null;
}

function checkShape(v, depth) {
  if (v === null || typeof v === 'boolean') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? null : 'عدد نامعتبر در داده.';
  if (typeof v === 'string') return v.length <= LIMITS.string ? null : 'متن داده بیش از حد طولانی است.';
  if (depth >= LIMITS.depth) return 'ساختار داده بیش از حد تودرتو است.';
  if (Array.isArray(v)) {
    if (v.length > LIMITS.items) return 'فهرست داده بیش از حد طولانی است.';
    for (const x of v) { const e = checkShape(x, depth + 1); if (e) return e; }
    return null;
  }
  if (typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.length > LIMITS.keys) return 'دادهٔ ارسالی فیلدهای زیادی دارد.';
    for (const k of keys) { const e = checkShape(v[k], depth + 1); if (e) return e; }
    return null;
  }
  return 'نوع داده پشتیبانی نمی‌شود.';
}

export function canonicalJson(v) {
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonicalJson(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

export function userMessage(type, payload, detail) {
  return `${TASKS[type].ask}\n${DETAIL[detail].hint}\n\nداده:\n${canonicalJson(payload)}`;
}
