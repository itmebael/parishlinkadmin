(() => {
  const queue = [];
  let active = false;
  function show(message, confirmation) {
    return new Promise(resolve => { queue.push({message:String(message ?? ''),confirmation,resolve}); next(); });
  }
  function next() {
    if (active || !queue.length) return;
    if (!document.body) { document.addEventListener('DOMContentLoaded',next,{once:true}); return; }
    active = true;
    const item = queue.shift(), previous = document.activeElement;
    const destructive = item.confirmation && /delete|decline|discard|deactivate|remove|reject/i.test(item.message);
    const dialog = document.createElement('dialog');
    dialog.className = 'parish-feedback';
    dialog.setAttribute('aria-labelledby','parish-feedback-title');
    dialog.setAttribute('aria-describedby','parish-feedback-message');
    dialog.innerHTML = '<div class="parish-feedback__accent"></div><div class="parish-feedback__body"><h2 id="parish-feedback-title"></h2><p id="parish-feedback-message"></p></div><footer><button type="button" class="parish-feedback__cancel">Cancel</button><button type="button" class="parish-feedback__accept"></button></footer>';
    const cancel = dialog.querySelector('.parish-feedback__cancel');
    const accept = dialog.querySelector('.parish-feedback__accept');
    dialog.querySelector('h2').textContent = item.confirmation ? 'Are you sure?' : 'ParishLink notice';
    let message = item.message;
    if (/^Confirm the priest or parish office is available, then approve this request\?$/i.test(message)) {
      message = 'You are about to approve this request.';
    } else if (/^Mark as Completed this request\?$/i.test(message)) {
      message = 'This request will be marked as completed. Please make sure the service has been provided.';
    } else if (/^Decline this request\?$/i.test(message)) {
      message = 'This request will be declined. The requester will see the updated status.';
    }
    dialog.querySelector('#parish-feedback-message').textContent = message;
    let action = 'Yes, continue';
    if (/\bapprove\b/i.test(item.message)) action = 'Yes, approve';
    else if (/\bdelete\b/i.test(item.message)) action = 'Yes, delete';
    else if (/\bdecline\b/i.test(item.message)) action = 'Yes, decline';
    else if (/\bdiscard\b/i.test(item.message)) action = 'Discard changes';
    else if (/\bdeactivate\b/i.test(item.message)) action = 'Yes, deactivate';
    else if (/\bcompleted\b/i.test(item.message)) action = 'Mark completed';
    accept.textContent = item.confirmation ? action : 'Got it';
    if (destructive) accept.classList.add('is-destructive');
    cancel.hidden = !item.confirmation;
    let finished = false;
    function finish(result) {
      if (finished) return;
      finished = true;dialog.close();dialog.remove();active=false;
      if (previous?.isConnected) previous.focus({preventScroll:true});
      item.resolve(result);next();
    }
    cancel.addEventListener('click',()=>finish(false));
    accept.addEventListener('click',()=>finish(true));
    dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});
    dialog.addEventListener('click',event=>{
      if(event.target!==dialog)return;
      const rect=dialog.getBoundingClientRect();
      if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)finish(false);
    });
    document.body.append(dialog);dialog.showModal();
    (item.confirmation ? cancel : accept).focus();
  }
  window.parishDialogs = { alert:message=>show(message,false), confirm:message=>show(message,true) };
})();