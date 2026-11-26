/* ============================================================
   Arabic / English. English is written in the pages; when Arabic is
   chosen this file translates the interface text as it appears
   (exact phrases first, then patterns for text with names/amounts),
   flips the layout right-to-left, and makes dates Arabic.
   People's own words (chat, notes, item names) are left as written.
   ============================================================ */
const LANG = (() => { try { return localStorage.getItem("lang") === "ar" ? "ar" : "en"; } catch { return "en"; } })();
function setLang(l) {
  try { localStorage.setItem("lang", l === "ar" ? "ar" : "en"); } catch {}
  location.reload();
}

const AR = {
  // nav + chrome
  "Fund": "الصندوق", "Expenses": "المصاريف", "Office": "المكتب", "Chat": "الدردشة", "Reports": "التقارير", "Admin": "الإدارة",
  "Settings": "الإعدادات", "password": "كلمة المرور", "sign out": "تسجيل الخروج", "Log in": "تسجيل الدخول", "You": "أنت",
  "Create account": "إنشاء حساب", "Username": "اسم المستخدم", "Password": "كلمة المرور", "Cancel": "إلغاء", "Close": "إغلاق", "Save": "حفظ",
  "Welcome back — log in to your account.": "أهلاً بعودتك، سجّل الدخول إلى حسابك.",
  "Pick a username and a password (8+ characters).": "اختر اسم مستخدم وكلمة مرور (8 أحرف أو أكثر).",
  "Password (8+ characters)": "كلمة المرور (8 أحرف أو أكثر)",
  "Your username is your name across The Office. Passwords are kept encrypted.": "اسم المستخدم هو اسمك في المكتب. كلمات المرور محفوظة بشكل مشفّر.",
  "Enter a username": "أدخل اسم المستخدم", "Enter your password": "أدخل كلمة المرور",
  "Wrong username or password": "اسم المستخدم أو كلمة المرور غير صحيحة",
  "Dark mode": "الوضع الداكن", "Light mode": "الوضع الفاتح",

  // fund page
  "The office fund.": "صندوق المكتب.",
  "One pot for Malek's office. Deposit money, see where every fils goes, and get notified about every change to your balance.": "صندوق واحد لمكتب مالك. أودِع المال، وشاهد أين يذهب كل فلس، واحصل على إشعار بكل تغيير في رصيدك.",
  "Your balance": "رصيدك", "Fund total": "إجمالي الصندوق", "Malek's office": "مكتب مالك", "Tap a desk": "اضغط على مكتب",
  "Your wallet": "محفظتك", "You owe": "عليك", "Deposit": "إيداع", "Deposit money": "إيداع مبلغ",
  "Tell the admin how much you're adding. It counts once the admin confirms they got it.": "أخبر المسؤول بالمبلغ الذي تضيفه. يُحتسب بعد أن يؤكد المسؤول استلامه.",
  "Amount in JD, like 50": "المبلغ بالدينار، مثلاً 50", "Cash": "نقداً", "CliQ": "كليك", "Bank transfer": "تحويل بنكي", "Other": "أخرى",
  "Note (optional), like a CliQ reference": "ملاحظة (اختياري)، مثل رقم مرجع كليك",
  "Add a payment screenshot (optional)": "أضف صورة الدفع (اختياري)", "Add a photo (optional)": "أضف صورة (اختياري)",
  "Add the receipt photo (optional)": "أضف صورة الإيصال (اختياري)",
  "Send request": "إرسال الطلب", "Deposit sent to the admin": "تم إرسال الإيداع إلى المسؤول",
  "Enter an amount in JD, up to 3 decimals": "أدخل المبلغ بالدينار، حتى 3 خانات عشرية",
  "Fund forecast": "توقّعات الصندوق", "Next 30 days · your share": "الـ30 يوماً القادمة · حصتك", "Next 30 days · whole fund": "الـ30 يوماً القادمة · الصندوق كاملاً", "Next 30 days": "الـ30 يوماً القادمة",
  "No bills or approved buys coming up in the next 30 days.": "لا فواتير أو مشتريات معتمدة خلال الـ30 يوماً القادمة.",
  "≈ means an estimate from the last 3 months.": "≈ تعني تقديراً من آخر 3 أشهر.",
  "Some bills have no amount yet, so the real number may be lower.": "بعض الفواتير بلا مبلغ بعد، لذلك قد يكون الرقم الحقيقي أقل.",
  "amount not known yet": "المبلغ غير معروف بعد", "approved buy": "شراء معتمد", "due now": "مستحق الآن", "Any day": "أي يوم",
  "Notifications": "الإشعارات", "Mark all read": "تحديد الكل كمقروء", "Your notifications": "إشعاراتك",
  "Your money": "أموالك", "Every movement, newest first": "كل حركة، الأحدث أولاً",
  "Monthly statements": "كشوفات شهرية", "Made on the 1st of each month": "تصدر في أول كل شهر",
  "Your first statement arrives on the 1st of next month.": "يصلك أول كشف في أول الشهر القادم.",
  "No money movements yet. Make your first deposit above.": "لا حركات مالية بعد. قم بأول إيداع من الأعلى.",
  "Nothing yet. Every change to your money will show up here.": "لا شيء بعد. كل تغيير في أموالك سيظهر هنا.",
  "In credit": "رصيد موجب", "Under 10 JD": "أقل من 10 دنانير", "Owes money": "عليه مبلغ", "Free desk": "مكتب شاغر",
  "Deposit waiting": "إيداع بانتظار الموافقة", "Active now": "نشط الآن", "In the office today": "في المكتب اليوم", "In": "هنا",
  "Kitchen": "المطبخ", "Desks": "المكاتب", "Meeting room": "غرفة الاجتماعات", "Sink": "المغسلة", "WC": "الحمام",
  "Busy now": "مشغولة الآن", "Free now": "متاحة الآن", "Tap to book": "اضغط للحجز", "Nothing booked": "لا حجوزات",
  "Kitchen 1": "المطبخ 1", "Kitchen 2": "المطبخ 2", "Desk 1": "مكتب 1", "Desk 2": "مكتب 2", "Desk 3": "مكتب 3", "Desk 4": "مكتب 4", "Desk 5": "مكتب 5",
  "Desks area": "منطقة المكاتب", "No desk": "بلا مكتب", "This desk is free.": "هذا المكتب شاغر.",
  "You're the admin": "أنت المسؤول", "No desk, no share": "بلا مكتب وبلا حصة", "Total in the fund": "المجموع في الصندوق",
  "Open the admin panel": "افتح لوحة الإدارة", "Print or save as PDF": "طباعة أو حفظ كـ PDF",
  "Opening": "الرصيد الافتتاحي", "Money in": "الوارد", "Money out": "الصادر", "Closing": "الرصيد الختامي", "No movements this month.": "لا حركات هذا الشهر.",
  "Photo": "صورة", "Loading…": "جارٍ التحميل…", "Couldn't load the photo.": "تعذّر تحميل الصورة.",
  "Log in to see the office fund": "سجّل الدخول لرؤية صندوق المكتب",
  "Balances, deposits and shared bills are only visible to the six members and the admin.": "الأرصدة والإيداعات والفواتير المشتركة تظهر فقط للأعضاء الستة والمسؤول.",
  "You're not in the office fund yet": "لست في صندوق المكتب بعد", "The fund isn't set up yet": "الصندوق غير مُعدّ بعد",
  "Hasn't signed in yet": "لم يسجّل الدخول بعد", "no desk, no share, no vote": "بلا مكتب ولا حصة ولا تصويت",

  // expenses
  "Expenses.": "المصاريف.",
  "The bills we pay every month, and the things we want to buy. A wishlist item is only bought if all six members say yes.": "الفواتير التي ندفعها كل شهر، والأشياء التي نريد شراءها. لا يُشترى أي عنصر إلا إذا وافق الأعضاء الستة جميعاً.",
  "Bills a month": "الفواتير شهرياً", "Open votes": "تصويتات مفتوحة", "Monthly bills": "الفواتير الشهرية",
  "Wishlist": "قائمة الرغبات", "Propose something": "اقترح شيئاً", "Voting now": "التصويت جارٍ",
  "Approved · waiting for the admin to buy": "تمت الموافقة · بانتظار شراء المسؤول", "Closed": "مغلقة",
  "Waiting for admin": "بانتظار المسؤول", "Next month": "الشهر القادم", "Skipped this month": "تم تخطيها هذا الشهر", "Reversed": "تم عكسها",
  "Changes monthly": "تتغير شهرياً", "Voting": "تصويت", "Approved": "تمت الموافقة", "Rejected": "مرفوض", "Not approved": "لم تتم الموافقة",
  "Withdrawn": "مسحوب", "Bought": "تم الشراء", "Withdraw": "سحب", "No": "لا", "Yes": "نعم", "You said yes": "صوّتَّ بنعم", "Change to no": "غيّر إلى لا",
  "Propose again": "اقترح مجدداً", "View the item ↗": "عرض العنصر ↗", "Record purchase": "سجّل الشراء",
  "Waiting for the admin to buy it": "بانتظار أن يشتريه المسؤول", "Start the vote": "ابدأ التصويت",
  "Propose something to buy": "اقترح شيئاً للشراء", "Propose it again": "اقترحه مجدداً",
  "Everyone gets notified. It's bought only if all members say yes.": "سيصل إشعار للجميع. لا يُشترى إلا إذا وافق كل الأعضاء.",
  "Price in JD, like 79.5": "السعر بالدينار، مثلاً 79.5", "Link (optional)": "رابط (اختياري)", "Why we need it (optional)": "لماذا نحتاجه (اختياري)",
  "Voting time": "مدة التصويت", "Vote no": "صوّت بلا", "Write a short reason": "اكتب سبباً قصيراً",
  "One no rejects it. Say why, so it can be changed and proposed again.": "صوت واحد بـ«لا» يرفضه. اذكر السبب ليمكن تعديله واقتراحه مجدداً.",
  "Nothing up for a vote. Propose something the office needs.": "لا شيء للتصويت. اقترح شيئاً يحتاجه المكتب.",
  "Nothing waiting to be bought.": "لا شيء بانتظار الشراء.", "Nothing closed yet.": "لا شيء مغلق بعد.",
  "No monthly bills yet. The admin adds them from the admin panel.": "لا فواتير شهرية بعد. يضيفها المسؤول من لوحة الإدارة.",

  // office
  "Who's in today": "من في المكتب اليوم", "I'm in the office": "أنا في المكتب", "I'm leaving": "أنا مغادر",
  "You're in the office": "أنت في المكتب", "You left": "غادرت", "You haven't checked in today": "لم تسجّل حضورك اليوم",
  "Let everyone know you're here.": "أخبر الجميع أنك هنا.", "Not in yet": "لم يصل بعد", "Checked in": "تم تسجيل الحضور", "Checked out. See you!": "تم تسجيل المغادرة. إلى اللقاء!",
  "Chores": "المهام", "New chore": "مهمة جديدة", "+ New chore": "+ مهمة جديدة", "Mark done": "تم الإنجاز", "Undo": "تراجع", "Your turn": "دورك", "Edit": "تعديل", "Paused": "متوقفة",
  "Repeats every": "تتكرر كل", "Day": "يوم", "2 days": "يومين", "3 days": "3 أيام", "Week": "أسبوع", "2 weeks": "أسبوعين", "Month (30 days)": "شهر (30 يوماً)", "Active": "مفعّلة",
  "It rotates between the six members in name order. Whoever's turn it is gets a reminder.": "تدور بين الأعضاء الستة حسب ترتيب الأسماء. من عليه الدور يصله تذكير.",
  "Marked done. Thanks!": "تم. شكراً!", "Chore saved": "تم حفظ المهمة", "every day": "كل يوم",
  "No chores yet. Add one, like kitchen cleaning every week.": "لا مهام بعد. أضف واحدة، مثل تنظيف المطبخ أسبوعياً.",
  "No chores yet. The admin can add them.": "لا مهام بعد. يمكن للمسؤول إضافتها.",
  "Book the meeting room": "احجز غرفة الاجتماعات", "Book": "احجز", "Date": "التاريخ", "From": "من", "To": "إلى",
  "What's it for? (optional)": "لأي غرض؟ (اختياري)", "Meeting room booked": "تم حجز غرفة الاجتماعات", "Booking cancelled": "تم إلغاء الحجز",
  "No bookings coming up.": "لا حجوزات قادمة.", "Today": "اليوم", "Yesterday": "أمس", "Meeting": "اجتماع",
  "Office.": "المكتب.", "Who's here, whose turn it is, and when the meeting room is free.": "من هنا، ودور من، ومتى تكون غرفة الاجتماعات متاحة.",
  "Upcoming bookings": "الحجوزات القادمة",

  // chat
  "Chat.": "الدردشة.", "For the six members and the admin. See who's around right now.": "للأعضاء الستة والمسؤول. شاهد من متواجد الآن.",
  "People": "الأشخاص", "Write a message": "اكتب رسالة", "Send": "إرسال", "No messages yet. Say hi to the office.": "لا رسائل بعد. ألقِ التحية على المكتب.",
  "admin": "مسؤول", "you": "أنت", "everyone": "الجميع", "React": "تفاعل",

  // reports
  "Reports.": "التقارير.", "Where the office money goes each month, and what each member has put in and paid.": "أين تذهب أموال المكتب كل شهر، وكم وضع كل عضو وكم دفع.",
  "Spending by month": "المصروف حسب الشهر", "Bills and purchases": "الفواتير والمشتريات", "Each member": "كل عضو",
  "Deposited": "المودَع", "Paid": "المدفوع", "Paid (share of bills and buys)": "المدفوع (حصته من الفواتير والمشتريات)", "Right column: balance now": "العمود الأيمن: الرصيد الحالي",
  "Balance": "الرصيد", "Member": "العضو", "Month": "الشهر", "Total": "المجموع", "Purchases": "المشتريات",
  "Show as tables": "عرض كجداول", "Hide tables": "إخفاء الجداول",
  "Spent this month": "مصروف هذا الشهر", "Spent in the last 12 months": "مصروف آخر 12 شهراً", "Average a month": "المعدّل الشهري", "In the fund now": "في الصندوق الآن",
  "Nothing spent yet. Charged bills and purchases show up here.": "لم يُصرف شيء بعد. الفواتير والمشتريات المحمّلة تظهر هنا.", "No members yet.": "لا أعضاء بعد.",
  "Rent": "الإيجار", "Internet": "الإنترنت", "Electricity": "الكهرباء", "Water": "المياه",

  // settings
  "Settings.": "الإعدادات.", "Alerts on your phone and WhatsApp, language and theme.": "التنبيهات على هاتفك وواتساب، واللغة والمظهر.",
  "Phone notifications": "إشعارات الهاتف", "WhatsApp alerts": "تنبيهات واتساب", "Language and look": "اللغة والمظهر",
  "Phone and computer notifications": "إشعارات الهاتف والكمبيوتر", "On for this device.": "مفعّلة على هذا الجهاز.", "Off for this device.": "متوقفة على هذا الجهاز.",
  "Turn on for this device": "فعّلها على هذا الجهاز", "Turn off on this device": "أوقفها على هذا الجهاز",
  "Chat messages": "رسائل الدردشة", "Also notify me about new chat messages. Mentions always notify.": "أبلغني أيضاً برسائل الدردشة الجديدة. الإشارات تُبلَّغ دائماً.",
  "Test": "تجربة", "Send me a test": "أرسل لي تجربة", "Sends a test alert to every device and WhatsApp you've set up.": "يرسل تنبيهاً تجريبياً لكل أجهزتك وواتساب.",
  "Test sent. It should arrive in a few seconds.": "تم الإرسال. يجب أن يصل خلال ثوانٍ.",
  "Notifications are on for this device": "الإشعارات مفعّلة على هذا الجهاز", "Notifications are off for this device": "الإشعارات متوقفة على هذا الجهاز",
  "Send me WhatsApp alerts": "أرسل لي تنبيهات واتساب", "Language": "اللغة", "Theme": "المظهر", "Light": "فاتح", "Dark": "داكن", "Auto": "تلقائي",
  "Light, dark, or follow your device.": "فاتح أو داكن أو حسب جهازك.", "Change password": "تغيير كلمة المرور",
  "Your WhatsApp number, like +962791234567": "رقم واتساب الخاص بك، مثل +962791234567", "API key from CallMeBot": "مفتاح API من CallMeBot",
  "WhatsApp settings saved": "تم حفظ إعدادات واتساب", "Chat notifications on": "إشعارات الدردشة مفعّلة", "Chat notifications off": "إشعارات الدردشة متوقفة",
  "This browser can't show notifications. Try Chrome, Edge or Safari.": "هذا المتصفح لا يدعم الإشعارات. جرّب Chrome أو Edge أو Safari.",
  "Notifications are blocked for this site. Allow them in your browser's site settings, then reload.": "الإشعارات محظورة لهذا الموقع. اسمح بها من إعدادات المتصفح ثم أعد التحميل.",
  "You'll get WhatsApp messages for money changes, bills, votes, chores and mentions (not every chat message). CallMeBot is a free third-party service for personal use.": "ستصلك رسائل واتساب لتغييرات المال والفواتير والتصويت والمهام والإشارات (ليس كل رسائل الدردشة). CallMeBot خدمة مجانية من طرف ثالث للاستخدام الشخصي.",

  // admin (main labels)
  "Fund admin.": "إدارة الصندوق.", "Approve deposits, confirm the monthly bills, record what you buy for the office, and manage who sits where.": "وافق على الإيداعات، وأكّد الفواتير الشهرية، وسجّل ما تشتريه للمكتب، ونظّم أماكن الجلوس.",
  "Deposit requests": "طلبات الإيداع", "Approve once you have the money": "وافق بعد استلام المال", "Approve": "موافقة", "Reject": "رفض",
  "Bills waiting for you": "فواتير بانتظارك", "+ New bill": "+ فاتورة جديدة", "All monthly bills": "كل الفواتير الشهرية", "Charge everyone": "حمّل على الجميع", "Skip": "تخطٍّ",
  "Record a purchase": "سجّل عملية شراء", "Split between all members": "تُقسم على جميع الأعضاء", "From the wishlist": "من قائمة الرغبات", "Not from the wishlist": "ليست من قائمة الرغبات",
  "Members and desks": "الأعضاء والمكاتب", "History": "السجل", "Reverse a mistake: the original stays in the record": "اعكس خطأً: يبقى الأصل في السجل",
  "Reverse": "عكس", "Add photo": "أضف صورة", "Deposits to approve": "إيداعات للموافقة", "Bills to confirm": "فواتير للتأكيد",
  "Approved to buy": "معتمد للشراء", "Members owing": "أعضاء عليهم مبالغ", "No deposits waiting.": "لا إيداعات بانتظار الموافقة.",
  "No bills waiting. Bills show up here on their due day.": "لا فواتير بانتظارك. تظهر الفواتير هنا في يوم استحقاقها.",
  "Purchase": "شراء", "Bill": "فاتورة", "Move desk": "نقل المكتب", "Remove": "إزالة", "Keep it free": "أبقه شاغراً", "Add to this desk": "أضف إلى هذا المكتب",
  "Only the admin can open this page": "هذه الصفحة للمسؤول فقط",
  "Admin:": "المسؤول:", "The old storage room": "غرفة المخزن سابقاً", "Deposited vs. paid": "المودَع مقابل المدفوع",
  "to stay at zero.": "لتبقى عند الصفر.", "Members need to deposit": "يحتاج الأعضاء إلى إيداع", "in total to stay at zero.": "إجمالاً للبقاء عند الصفر.",
  "Members who'll owe after the next 30 days": "أعضاء سيصبح عليهم مبالغ خلال الـ30 يوماً القادمة", "changes monthly": "تتغير شهرياً",
  "tap a desk to manage it": "اضغط على مكتب لإدارته", "Open": "افتح", "CallMeBot's WhatsApp setup page": "صفحة إعداد واتساب في CallMeBot",
  "and save the bot's number in your contacts (it changes sometimes, so use the number shown there).": "واحفظ رقم البوت في جهات اتصالك (يتغيّر أحياناً، لذا استخدم الرقم المعروض هناك).",
  "Send it this WhatsApp message:": "أرسل له رسالة واتساب هذه:", "It replies with your API key. Paste it below with your own WhatsApp number.": "سيرد عليك بمفتاح API. الصقه أدناه مع رقم واتساب الخاص بك.",
  "العربية or English, on this device.": "العربية أو الإنجليزية، على هذا الجهاز.", "Money in": "الوارد", "Money out": "الصادر",
  "Fixed amount": "مبلغ ثابت", "Estimate from recent months. Enter the real amount.": "تقدير من الأشهر الأخيرة. أدخل المبلغ الحقيقي.", "Enter this month's amount": "أدخل مبلغ هذا الشهر",
  "Deposit from": "إيداع من", "paused": "متوقفة", "Bills": "الفواتير", "New monthly bill": "فاتورة شهرية جديدة", "Due day of the month": "يوم الاستحقاق من الشهر",
  "Name the bill": "سمِّ الفاتورة", "Bill saved": "تم حفظ الفاتورة", "What you bought, like TV": "ماذا اشتريت، مثلاً تلفاز", "Total paid in JD": "المجموع المدفوع بالدينار",
  "Note (optional), like the shop": "ملاحظة (اختياري)، مثل اسم المحل", "Purchase recorded. Everyone has been notified.": "تم تسجيل الشراء وإبلاغ الجميع.",
  "Rent, internet, electricity and so on.": "الإيجار والإنترنت والكهرباء وغيرها.", "Add rent, internet, electricity and so on.": "أضف الإيجار والإنترنت والكهرباء وغيرها.",
  "Nothing yet.": "لا شيء بعد.", "Charged. Everyone has been notified.": "تم التحميل وإبلاغ الجميع.", "Photo added": "تمت إضافة الصورة",

};
const AR_MONTHS = { January: "كانون الثاني", February: "شباط", March: "آذار", April: "نيسان", May: "أيار", June: "حزيران", July: "تموز",
  August: "آب", September: "أيلول", October: "تشرين الأول", November: "تشرين الثاني", December: "كانون الأول" };


// patterns for text that includes names, amounts or dates
const AR_PATTERNS = [
  [/^([−+-]?[\d,]+\.\d{3}) JD$/, "$1 د.أ"], [/^Your (.+) statement$/, "كشف $1"],
  [/^(January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})$/, (m, mo, y) => `${AR_MONTHS[mo]} ${y}`],
  [/^(\d+)([mhd]) ago$/, (m, n, u) => `منذ ${n} ${u === "m" ? "دقيقة" : u === "h" ? "ساعة" : "يوم"}`],
  [/^Day (\d+)$/, "يوم $1"], [/^(\d+) members?$/, "$1 أعضاء"], [/^(\d+) free desks?$/, "$1 مكتب شاغر"],
  [/^Now (.+)$/, "الآن $1"], [/^needs (.+)$/, "يحتاج $1"], [/^(.+) \(approved\)$/, "$1 (معتمد)"],
  [/^Split between (\d+) members\. Enter the total to see each share\.$/, "تُقسم على $1 أعضاء. أدخل المجموع لرؤية حصة كل شخص."],
  [/^(\d+) pay (.+), (\d+) pay (.+) \(exact total (.+)\)$/, "$1 يدفعون $2، و$3 يدفعون $4 (المجموع بالضبط $5)"],
  [/^(\d+) members pay (.+) each$/, "يدفع كل عضو من الـ$1 $2"], [/^Will owe after this: (.+)$/, "سيصبح عليهم مبلغ بعد ذلك: $1"],
  [/^Owes (.+)$/, "عليه $1"], [/^(\d+) in the office$/, "$1 في المكتب"], [/^(\d+) active now$/, "$1 نشط الآن"],
  [/^Last active (\d+)m ago$/, "آخر نشاط منذ $1 دقيقة"], [/^Last active (\d+)h ago$/, "آخر نشاط منذ $1 ساعة"], [/^Last active (\d+)d ago$/, "آخر نشاط منذ $1 يوم"],
  [/^Last active (.+)$/, "آخر نشاط $1"], [/^(.+)'s turn$/, "دور $1"], [/^until (.+)$/, "حتى $1"], [/^Next: (.+)$/, "التالي: $1"],
  [/^Done by (.+)$/, "أنجزها $1"], [/^Every (\d+) days$/, "كل $1 أيام"], [/^Every week$/, "كل أسبوع"], [/^Every day$/, "كل يوم"],
  [/^In since (.+)$/, "موجود منذ $1"], [/^Left at (.+)$/, "غادر الساعة $1"], [/^Since (.+)$/, "منذ $1"],
  [/^Busy until (.+), (.+)$/, "مشغولة حتى $1، $2"], [/^Free\. Next: (.+), (.+)$/, "متاحة. التالي: $1، $2"], [/^Free, nothing booked$/, "متاحة، لا حجوزات"],
  [/^Next (.+)$/, "التالي $1"], [/^(.+) until (\d.+)$/, "$1 حتى $2"],
  [/^(\d+) of (\d+) yes · waiting on (.+) · (.+)$/, "$1 من $2 نعم · بانتظار $3 · $4"], [/^(\d+) of (\d+) yes · everyone voted · (.+)$/, "$1 من $2 نعم · صوّت الجميع · $3"],
  [/^(\d+) days left$/, "متبقٍ $1 أيام"], [/^(\d+)h left$/, "متبقٍ $1 ساعة"], [/^(\d+)m left$/, "متبقٍ $1 دقيقة"],
  [/^All (\d+) said yes · (.+)$/, "وافق الجميع ($1) · $2"], [/^(.+) said no: “(.*)”$/, "$1 قال لا: «$2»"],
  [/^The vote closed with (\d+) of (\d+) yes\. Everyone has to agree\.$/, "أُغلق التصويت بـ$1 من $2 نعم. يجب أن يوافق الجميع."],
  [/^Bought · (.+)$/, "تم الشراء · $1"], [/^≈ (.+) each$/, "≈ $1 لكل شخص"], [/^(.+) each$/, "$1 لكل شخص"],
  [/^Charged (.+)$/, "تم التحميل $1"], [/^Due (.+)$/, "يستحق $1"], [/^day (\d+)$/, "يوم $1"], [/^· day (\d+)$/, "· يوم $1"],
  [/^Changes monthly · about (.+)$/, "تتغير شهرياً · حوالي $1"],
  [/^Split between (\d+) members? · nothing is charged until the admin confirms$/, "تُقسم على $1 أعضاء · لا يُحمَّل شيء قبل تأكيد المسؤول"],
  [/^After these, you'll be at$/, "بعدها سيصبح رصيدك"], [/^After these, the fund will be at$/, "بعدها سيصبح الصندوق"],
  [/^Deposit (.+) to stay at zero\.$/, "أودِع $1 لتبقى عند الصفر."],
  [/^\+(.+) waiting for the admin to approve$/, "+$1 بانتظار موافقة المسؤول"],
  [/^Sent (.+)$/, "أُرسل $1"], [/^(.+) statement$/, "كشف $1"],
  [/^(\d+) deposits? to approve$/, "$1 إيداع للموافقة"], [/^(\d+) bills? to confirm$/, "$1 فاتورة للتأكيد"],
  [/^(\d+) approved items? to buy$/, "$1 عنصر معتمد للشراء"], [/^(\d+) members? owing$/, "$1 عضو عليه مبلغ"],
  [/^Devices with notifications on: (\d+)$/, "الأجهزة المفعّل عليها الإشعارات: $1"], [/^Signed in as (.+)\.$/, "مسجّل الدخول باسم $1."],
  [/^About (.+) each if it passes\.$/, "حوالي $1 لكل شخص إذا تمت الموافقة."],
  // notifications written by the server
  [/^Deposit approved: (.+)$/, "تمت الموافقة على الإيداع: $1"], [/^Deposit rejected: (.+)$/, "تم رفض الإيداع: $1"],
  [/^You owe (.+)$/, "عليك $1"], [/^Reminder: you owe (.+)$/, "تذكير: عليك $1"], [/^Purchase: (.+)$/, "شراء: $1"],
  [/^New wishlist item: (.+)$/, "عنصر جديد في قائمة الرغبات: $1"], [/^Proposed again: (.+)$/, "اقتُرح مجدداً: $1"],
  [/^Approved by everyone: (.+)$/, "وافق الجميع: $1"], [/^Ready to buy: (.+)$/, "جاهز للشراء: $1"], [/^Rejected: (.+)$/, "مرفوض: $1"],
  [/^Not approved: (.+)$/, "لم تتم الموافقة: $1"], [/^Withdrawn: (.+)$/, "مسحوب: $1"], [/^Your vote is needed: (.+)$/, "صوتك مطلوب: $1"],
  [/^Your turn: (.+)$/, "دورك: $1"], [/^Reminder: (.+) is due today$/, "تذكير: $1 مستحقة اليوم"], [/^(.+) mentioned you in chat$/, "$1 أشار إليك في الدردشة"],
  [/^Reversed: (.+)$/, "تم العكس: $1"], [/^(.+) is due \((.+)\)$/, (m, a, b) => `${arPhrase(a)} مستحقة (${arPhrase(b)})`],
  [/^Deposit from (.+) \((Cash|CliQ|Bank transfer|Other)\)$/, (m, a, b) => `إيداع من ${a} (${AR[b]})`],
  [/^Deposit \((Cash|CliQ|Bank transfer|Other)\)$/, (m, b) => `إيداع (${AR[b]})`],
  [/^(Rent|Internet|Electricity|Water) (.+)$/, (m, a, b) => `${AR[a]} ${arPhrase(b)}`], [/^(.+) deposited (.+)$/, "$1 أودع $2"],
  [/^Welcome to the office fund$/, "أهلاً بك في صندوق المكتب"], [/^Test alert from The Office$/, "تنبيه تجريبي من المكتب"],
  [/^Your share: (.+) \(total (.+) split (\d+) ways\)\. New balance: (.+)\.$/, "حصتك: $1 (المجموع $2 مقسوم على $3). الرصيد الجديد: $4."],
  [/^Your share: (.+) \(total (.+) split (\d+) ways\)\. You now owe (.+)\.$/, "حصتك: $1 (المجموع $2 مقسوم على $3). أصبح عليك $4."],
  [/^New balance: (.+)\.$/, "الرصيد الجديد: $1."],
];

function arPhrase(t) {
  if (!t || !/[A-Za-z]/.test(t)) return t;
  let out = AR[t];
  if (out === undefined) {
    for (const [re, rep] of AR_PATTERNS) { if (re.test(t)) { out = t.replace(re, rep); break; } }
  }
  if (out === undefined && /\s·\s/.test(t)) {
    // "Desk 1 · Active now", "Day 1 · 425.000 JD" ... translate each part
    out = t.split(/\s·\s/).map((p) => arPhrase(p.trim())).join(" · ");
  }
  return out === undefined ? t : out.replace(/(\d) JD\b/g, "$1 د.أ");
}
function arText(s) {
  let t = s.trim();
  if (!t || !/[A-Za-z]/.test(t)) return s;
  // keep separators at the edges (" · Active now · ")
  const lead = (t.match(/^[·:\s]+/) || [""])[0], tail = (t.match(/[·\s]+$/) || [""])[0];
  const core = t.slice(lead.length, t.length - tail.length);
  const out = arPhrase(core);
  return out === core ? s : s.replace(t, lead + out + tail);
}
const SKIP = ".brand-name, .msg-bubble, .wish-title, .wish-reason, .bk-main b, .tx-memo, .notif-body, [data-no-i18n], script, style, code";
function translateTree(root) {
  if (LANG !== "ar" || !root) return;
  if (root.nodeType === 3) {
    if (!root.parentElement || root.parentElement.closest(SKIP)) return;
    const n = arText(root.nodeValue); if (n !== root.nodeValue) root.nodeValue = n; return;
  }
  if (root.nodeType !== 1 || root.closest?.(SKIP)) return;
  for (const a of ["placeholder", "title", "aria-label"]) {
    const v = root.getAttribute?.(a); if (v) { const n = arText(v); if (n !== v) root.setAttribute(a, n); }
  }
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node;
  while ((node = w.nextNode())) {
    if (node.nodeType === 1) {
      if (node.matches(SKIP)) { continue; }
      for (const a of ["placeholder", "title", "aria-label"]) {
        const v = node.getAttribute(a); if (v) { const n = arText(v); if (n !== v) node.setAttribute(a, n); }
      }
    } else if (node.parentElement && !node.parentElement.closest(SKIP)) {
      const n = arText(node.nodeValue); if (n !== node.nodeValue) node.nodeValue = n;
    }
  }
}

if (LANG === "ar") {
  document.documentElement.lang = "ar";
  document.documentElement.dir = "rtl";
  // Arabic month/day names, Western digits
  const loc = "ar-JO-u-nu-latn";
  for (const fn of ["toLocaleDateString", "toLocaleTimeString", "toLocaleString"]) {
    const orig = Date.prototype[fn];
    Date.prototype[fn] = function (l, o) { return orig.call(this, (!l || (Array.isArray(l) && !l.length)) ? loc : l, o); };
  }
  const origToast = window.toast;
  if (typeof origToast === "function") window.toast = (m) => origToast(arText(String(m)));
  const run = () => translateTree(document.body);
  if (document.body) run(); else document.addEventListener("DOMContentLoaded", run);
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "characterData") translateTree(m.target);
      else m.addedNodes.forEach((n) => translateTree(n));
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  document.title = document.title.replace(/^(\w+)(?= ·)/, (w) => AR[w] || w).replace("The Office", "المكتب");
}
