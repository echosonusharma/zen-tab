console.log('Popup script loaded');

document.addEventListener('DOMContentLoaded', () => {
  const contentElement = document.getElementById('content');
  if (contentElement) {
    contentElement.textContent = 'Manage your tabs and windows 🤠';
  }
});
