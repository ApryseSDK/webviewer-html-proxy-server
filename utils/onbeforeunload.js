function onBeforeUnload(e) {
    // Cancel the event
    e.preventDefault();
    // Chrome requires returnValue to be set
    e.returnValue = '';
}

function activateReloader() {
    window.addEventListener('beforeunload', onBeforeUnload);
}

function deactivateReloader() {
    window.removeEventListener('beforeunload', onBeforeUnload);
}

activateReloader();