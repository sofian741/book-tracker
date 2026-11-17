/** زر الرجوع: كل مستوى داخلي (صفحة فرعية/نافذة) يُدفع في history، والرجوع يعيد للرئيسية قبل الخروج. */
export function createNav({ onBack, toast }) {
  let depth = 0,
    suppress = 0,
    exitArmed = false;
  history.replaceState({ root: true }, "");
  history.pushState({ home: true }, "");
  addEventListener("popstate", (e) => {
    if (suppress > 0) {
      suppress--;
      return;
    }
    if (e.state?.root) {
      if (exitArmed) return;
      exitArmed = true;
      toast("اضغط رجوع مرة أخرى للخروج من التطبيق");
      setTimeout(() => {
        exitArmed = false;
        history.pushState({ home: true }, "");
      }, 2000);
      return;
    }
    if (depth > 0) depth--;
    if (onBack() === "refuse") {
      history.pushState({ n: 1 }, "");
      depth++;
    }
  });
  return {
    push() {
      history.pushState({ n: 1 }, "");
      depth++;
    },
    pop() {
      if (depth > 0) {
        depth--;
        suppress++;
        history.back();
      }
    },
    collapse() {
      if (depth > 0) {
        const n = depth;
        depth = 0;
        suppress++;
        history.go(-n);
      }
    },
    get depth() {
      return depth;
    },
  };
}
