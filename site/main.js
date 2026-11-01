for (const button of document.querySelectorAll("[data-copy]")) {
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = button.dataset.success;
    } catch {
      button.textContent = button.dataset.failure;
      const code = button.parentElement.querySelector("code");
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
    window.setTimeout(() => {
      button.textContent = button.dataset.label;
    }, 2200);
  });
}
const example = document.querySelector("#example-video");
for (const button of document.querySelectorAll("[data-example]")) {
  button.addEventListener("click", () => {
    for (const tab of document.querySelectorAll("[data-example]"))
      tab.setAttribute("aria-pressed", String(tab === button));
    example.src = button.dataset.example;
    example.setAttribute("aria-label", button.textContent);
    example.play().catch(() => {});
  });
}
