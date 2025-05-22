import { storage } from '/js/store.js';
import { ticktickApi } from '/js/ticktickapi.js';


async function getTabContentAsMarkdown(tab) {
    try {
        var result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: [
                '/lib/readability-0.4.4.js',
                '/lib/turndown-7.1.2.js',
                '/js/contentscript.js'
            ],
        });
    } catch (error) {
        console.log(error);
        return "";
    }

    if (!Array.isArray(result) || result.length == 0)
        return "";

    var markdown = result[0].result;
    // Finds # only if not immediately followed by whitespace or \ / # " : * ? < > |
    // these symbols all invalidate a string that would otherwise be recognized as a tag
    // by TickTick. We place an invalid symbol after each found #.
    const removeTagsRegex = /#(?![\s\\\/#":*?<>|])/g;
    markdown = markdown.replace(removeTagsRegex, '#/');
    return markdown;
}

export async function oneClickTickTick(tab, contextInfo) {
    const options = await storage.loadOptions();

    const plainTitle = tab.title;
    const linkToPage = '[' + tab.title + '](' + tab.url + ')';

    const payload = {
        title: plainTitle,
        description: `Link: ${linkToPage}`,
        tags: options.tags,
        activeTabId: tab.id,
        targetListId: options.targetListId,
        priority: options.taskPriority,
    };

    if (contextInfo && contextInfo.selectionText) {
        payload.title = contextInfo.selectionText;
    }

    var dueDateNum = Number(options.dueDate);
    if (dueDateNum != -1) {
        var dueDate = new Date();
        dueDate.setHours(0, 0, 0, 0);
        // add one day of milliseconds times dueDate value (0 = today, 1 = tomorrow, etc.)
        dueDate.setTime(dueDate.getTime() + dueDateNum * 24 * 60 * 60 * 1000);
        payload.dueDate = dueDate.toISOString();
    }

    const result = await createTask(payload);
    if (result !== true) {
        const error = result;
        console.log(error);

        let errorContent = {
            title: "Failed to create task!",
            message: error.message,
            buttons: []
        };
        createNotification(null, errorContent);
    }
}

function createNotification(notificationId, options, taskPromise) {
    return new Promise((resolve, reject) => {
        chrome.notifications.create(notificationId, options, function (createdId) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            }

            var handler = function (id, buttonIndex, retries) {
                if (id != createdId) {
                    return;
                }

                taskPromise
                    .then(response => response.clone().json())
                    .then(data => {
                        if (buttonIndex === 0) {
                            chrome.tabs.create({ url: 'https://ticktick.com/webapp/#p/' + data.projectId + '/tasks/' + data.id });
                            chrome.notifications.clear(id);
                        } else if (buttonIndex === 1) {
                            ticktickApi.task.delete(data.projectId, data.id);
                            chrome.notifications.clear(id);
                        }
                    });

                chrome.notifications.onButtonClicked.removeListener(handler);
            };

            chrome.notifications.onButtonClicked.addListener(handler);
            resolve(createdId);
        });
    });
};

export function getSelectionInfo(info, tab, callback) {
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: () => getSelection().toString()
    }, function (response) {
        var result = response[0].result;
        var selection = info.selectionText;

        if (!chrome.runtime.lastError && result.length > 0) {
            selection = result[0];
        }

        selection = info.selectionText.replace(/(\r\n|\n|\r)/gm, "\n\n");
        callback(selection);
    });
};

/**
 * Payload format:
 * {
 *  title: string;
 *  description: string;
 *  targetListId?: string;
 *  tags?: string;   // Comma separated
 *  dueDate?: string;    // ISO format
 *  priority?: string;
 *  activeTabId?: number;
 * }
 */
export async function createTask(payload) {
    if (!await ticktickApi.authorized()) {
        chrome.runtime.openOptionsPage();
        return;
    }

    const options = await storage.loadOptions();

    const taskData = {
        title: payload.title,
        content: payload.description,
    };

    if (payload.targetListId) {
        taskData.projectId = payload.targetListId;
    }

    if (payload.priority) {
        taskData.priority = payload.priority;
    }

    if (payload.dueDate) {
        payload.dueDate = payload.dueDate.replace('Z', '+0000')
        taskData.dueDate = payload.dueDate;
        taskData.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        taskData.isAllDay = true;  // required to not show up as "at 00:00"
    }

    if (payload.tags) {
        // example: "  tag1, tag2" -> "#tag1 #tag2"
        let tags = payload.tags
            .split(",")
            .map(tag => tag.trim())
            .filter(tag => tag)  // remove empty tags (i.e. extra spaces)
            .map(tag => '#' + tag)
            .join(" ");

        if (taskData.content) {
            taskData.content += "\n\n";
        } else {
            taskData.content = "";
        }

        taskData.content += "Tags: " + tags
    }

    try {
        const task = ticktickApi.task.create(taskData);
        var response = await task;
        if (!response.ok) {
            if (response.status === 401) {
                console.error('Unauthorized error');
                chrome.runtime.openOptionsPage();
                return 'Unauthorized';
            }
            console.error('Error during task creation: ', response.status);
            return "An error occured during task creation: " + response.status;
        } else {
            const data = await response.clone().json();
            console.log("Success: ", data);

            if (options.showNotification) {
                let newNotification = {
                    title: "TickTick Task Created",
                    message: 'Title: ' + payload.title,
                    iconUrl: "/icons/icon256.png",
                    type: "basic",
                    buttons: [
                        { title: 'Show Task...' },
                        { title: 'Delete Task' }
                    ]
                };

                createNotification(null, newNotification, task);
            }

            if (options.autoClose && payload.activeTabId) {
                chrome.tabs.remove(payload.activeTabId, function () { });
            }
        }
    } catch (error) {
        console.error(error);
        return error.message;
    }

    return true;
}
