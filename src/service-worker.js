import {storage} from '/js/store.js';
import {ticktickApi} from '/js/ticktickapi.js';
import {createTask} from '/js/oneclickticktick.js';

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
    .then(function(registration) {
      console.log('Registration successful, scope is:', registration.scope);
    })
    .catch(function(error) {
      console.log('Service worker registration failed, error:', error);
    });
}

//////////////////
// Event Handlers
//////////////////


self.addEventListener('install', function(event) {
    // currently unused
});


// add context menu items
chrome.runtime.onInstalled.addListener(function() {
    chrome.contextMenus.create({
        id: 'OneClickTickTick',
        title: "Create task in TickTick",
        contexts: ["all"]
    });
    // chrome.contextMenus.create({
    //     id: 'OneClickTickTick' + 'Selection',
    //     title: "Create task in TickTick from Selection",
    //     contexts: ["selection"]}
    // );
});


// handle extension button click
// chrome.action.onClicked.addListener(function(tab) {
//     oneClickTickTick(tab);
// });

// Allows users to open the side panel by clicking on the action toolbar icon
chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));

// listen to context menu
chrome.contextMenus.onClicked.addListener(function(info, tab) {
    if (info.menuItemId.startsWith('OneClickTickTick')) {
        if (chrome.sidePanel) {
            chrome.sidePanel.open({ windowId: tab.windowId });
        } else {
            // Open in a popup windows
            chrome.windows.getCurrent({ populate: false }, (win) => {
                const top = (win.top || 0) + 100;
                const left = (win.left || 0) + 100;

                chrome.windows.create({
                    url: chrome.runtime.getURL(`popup.html?tabId=${tab.id || -1}`),
                    type: "popup",
                    width: 480,
                    height: 860,
                    top,
                    left
                });
            });
        }
    }
});


// communication with options page
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.type === 'task') {
        createTask(message.payload).then(sendResponse);
    } else if (message.type === 'login') {
        ticktickApi.login().then(sendResponse);
    } else if (message.type === 'logout') {
        ticktickApi.logout().then(sendResponse);
    } else if (message.type === 'getOptions') {
        storage.loadOptions().then(opts => {
            sendResponse(opts);
        });
    } else if (message.type === 'setOptions') {
        console.log("setOptions:", message.payload)
        storage.set(message.payload);
    } else if (message.type === 'isLoggedIn') {
        ticktickApi.authorized().then(response => {
            sendResponse(response);
        });
    } else if (message.type === 'getLists') {
        // This API is broken
        ticktickApi.project.getAll().then(response => {
            sendResponse(response);
        });
    } else {
        console.log("Unrecognized message:", message, sender);
    }

    return true;
});