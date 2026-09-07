document.querySelector("#next")?.addEventListener("click", () => {
  window.location.assign("/next");
});

const greeting = document.querySelector("#greeting");
if (greeting instanceof HTMLDialogElement) greeting.showModal();
