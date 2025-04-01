console.log('Content script loaded');

function modifyPage() {
  const app = document.createElement('div');
  app.id = 'my-extension-app';
  app.textContent = 'ZenTab';
  app.style.position = 'fixed';
  app.style.bottom = '10px';
  app.style.right = '10px';
  app.style.backgroundColor = '#f0f0f0';
  app.style.padding = '10px';

  app.style.zIndex = '9999';

  document.body.appendChild(app);
}

window.addEventListener('load', modifyPage);

