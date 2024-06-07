if (process.env.DEV_SERVER_URL) {
  new EventSource(process.env.DEV_SERVER_URL + "/content").addEventListener("message", () => {
    window.location.reload();
  });
}
