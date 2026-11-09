// Keep a useful screen even if the application module cannot be loaded.
import("./app.js").catch(() => {
  const help = document.getElementById("boot-help");
  if (help) help.hidden = false;
});
