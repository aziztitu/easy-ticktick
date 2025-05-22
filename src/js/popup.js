function getQueryParam(key) {
    return new URLSearchParams(window.location.search).get(key);
}

var initFieldsFromTab = async function(tab) {
    const linkToPage = '[' + tab.title + '](' + tab.url + ')';
    const description = `\n\nLink: ${linkToPage}`;
    $taskDescription.val(description);

    // Set title from selection, or tab's title
    let title = tab.title;
    let [{ result: selectedText }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: () => getSelection().toString()
    });

    selectedText = selectedText.replace(/(\r\n|\n|\r)/gm, "\n\n");
    if (selectedText) {
        title = selectedText;
    }

    // Set Task Title
    $taskTitle.val(title);
}

var activeTabId = -1;
var initFieldsFromCurrentTab = async function() {
    const tabIdParam = getQueryParam("tabId");
    if (tabIdParam) {
        activeTabId = parseInt(tabIdParam, 10);

        // Get tab info
        chrome.tabs.get(activeTabId, async (tab) => {
            if (chrome.runtime.lastError) {
                console.error("Error getting tab:", chrome.runtime.lastError.message);
                return;
            }

            initFieldsFromTab(tab);
        });
        return;
    }

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (tab) {
        activeTabId = tab.id;
        initFieldsFromTab(tab);
    } else {
        console.error("Unable to get the active tab");
    }
}

// The GET projects API is Broken
// var loadLists = async function() {
//     chrome.runtime.sendMessage({type: 'getLists' }, function(response) {
//         console.log(response);
//     });
// }

var updateMessage = function(message) {
    console.log('Updating Message:', message);
    $statusMessage.html(message);
}

var createTask = async function() {
    const title = $taskTitle.val().trim();
    if (!title) {
        updateMessage('Missing Title');
        return;
    }

    const dueDateNum = $dueDate.val();
    let dueDateStr;
    if (dueDateNum >= 0) {
        var dueDate = new Date();
        dueDate.setHours(0, 0, 0, 0);
        // add one day of milliseconds times dueDate value (0 = today, 1 = tomorrow, etc.)
        dueDate.setTime(dueDate.getTime() + dueDateNum * 24 * 60 * 60 * 1000);
        dueDateStr = dueDate.toISOString();
    } else if (dueDateNum === '-2') {
        const dueDate = $dueDateSelect.val();
        if (!dueDate) {
            updateMessage('Select a Due Date');
            return;
        }

        var dueDateObj = new Date(dueDate);
        dueDateStr = dueDateObj.toISOString();
    }

    const payload = {
        title: title,
        description: $taskDescription.val(),
        targetListId: $targetList.val().trim(),
        tags: $tagsList.val(),
        dueDate: dueDateStr,
        priority: $taskPriority.val(),
        activeTabId: activeTabId,
    };

    updateMessage('Creating Task...');
    $createTaskBtn.toggle(false);
    $taskProgress.toggle(true);

    chrome.runtime.sendMessage({type: 'task', payload: payload }, function(response) {
        $taskProgress.toggle(false);

        if (response === true) {
            updateMessage('Task Created!');
            window.close();
        } else {
            updateMessage(response);
            $createTaskBtn.toggle(true);
        }
    });
}

var init = function() {
    chrome.runtime.sendMessage({type: 'isLoggedIn'}, function(response) {
        console.log("isLoggedIn:", response);
        $('#formSection').toggle(response);
        $('#loggedOutSection').toggle(!response);
        $('#footer').toggle(response);
    });

    $taskTitle = $('#taskTitle');
    $taskDescription = $('#taskDescription');
    $targetList = $('#targetList');
    $tagsList = $('#tagsList');
    $dueDate = $('#dueDate');
    $dueDateSelectField = $('#dueDateSelectField');
    $dueDateSelect = $('#dueDateSelect');
    $taskPriority = $('#taskPriority');
    $createTaskBtn = $('#createTaskBtn');
    $statusMessage = $('#statusMessage');
    $taskProgress = $('#taskProgress');
    $optionsBtn = $('#optionsBtn');

    chrome.runtime.sendMessage({type: 'getOptions'}, function(options) {
        console.log("Options:", options);
        $targetList.val(options.targetListId);
        $tagsList.val(options.tags);
        $dueDate.val(options.dueDate);
        $dueDateSelectField.toggle(options.dueDate === "-2");
        $taskPriority.val(options.taskPriority);
    });

    initFieldsFromCurrentTab();

    $dueDate.change(function() {
        const selectedDueDate = $dueDate.val();
        $dueDateSelectField.toggle(selectedDueDate === "-2");
    });

    $createTaskBtn.click(() => {
        createTask();
    });

    $optionsBtn.click(() => {
        chrome.runtime.openOptionsPage();
    })

    // $showNotification.change(function() {
    //     setOptions({showNotification: $showNotification.is(':checked')});
    // });
    // $taskTitle.change(function() {
    //     setOptions({taskTitle: $taskTitle.val()});
    // });
    // $autoClose.change(function() {
    //     setOptions({autoClose: $autoClose.is(':checked')});
    // });
    // $targetList.change(function() {
    //     setOptions({targetListId: $targetList.val().trim()});
    // });
    // $tagsList.change(function() {
    //     setOptions({tags: $tagsList.val().trim()});
    // });
    // $taskPriority.change(function() {
    //     setOptions({taskPriority: $taskPriority.val()});
    // });
    // $includePageContent.change(function() {
    //     setOptions({includePageContent: $includePageContent.is(':checked')});
    // });
};

$(document).ready(function() {
    init();
});