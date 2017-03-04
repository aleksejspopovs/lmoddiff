var SYMBOL_COLLAPSE = '⊟';
var SYMBOL_EXPAND = '⊞';

// STORAGE

function storage_get_auth_status() {
    return localStorage.lmod_auth_status;
}

function storage_get_changes() {
    return JSON.parse(localStorage.lmod_changes || '[]');
}

function storage_clear_changes() {
    delete localStorage['lmod_changes'];
}

function storage_get_classes() {
    return JSON.parse(localStorage.lmod_classes || '[]');
}

function storage_delete_classes() {
    delete localStorage['lmod_classes'];
}

function storage_get_class(classId) {
    var key = 'lmod_class_' + classId;
    if (localStorage[key] === undefined) {
        return undefined;
    }
    return JSON.parse(localStorage['lmod_class_' + classId]);
}

function storage_delete_class(classId) {
    delete localStorage['lmod_class_' + classId];
}

function storage_get_classes_complete() {
    var ids = storage_get_classes();
    var result = {};
    for (var i = 0; i < ids.length; i++) {
        result[ids[i]] = storage_get_class(ids[i]);
    }
    return result;
}

function storage_get_class_visibility(classId) {
    return localStorage['class_visibility_' + classId] === 'true';
}

function storage_set_class_visibility(classId, state) {
    localStorage['class_visibility_' + classId] = state;
}

function storage_get_autosync_state() {
    return !(localStorage['autosync'] === 'false');
}

function storage_set_autosync_state(state) {
    localStorage['autosync'] = state;
}

function storage_get_notifications() {
    return localStorage['notifications'] === 'true';
}

function storage_set_notifications(state) {
    localStorage['notifications'] = state;
}


// DOM MANIPULATION

function $id(x) {
    return document.getElementById(x);
}

function remove_all_children(element) {
    for (var i = element.children.length - 1; i >= 0; i--) {
        element.removeChild(element.children[0]);
    }
}

// LOGIC

function trigger_manual_sync(event) {
    chrome.runtime.getBackgroundPage(function (background) {
        background.synchronize_assignments();
    });
}

function autosync_toggle(event) {
    set_autosync_state(!storage_get_autosync_state());
}

function set_autosync_state(state) {
    if (state) {
        chrome.alarms.create('autosync', {
            periodInMinutes: 15
        });
    } else {
        chrome.alarms.clear('autosync');
    }
    $id('autosync_box').checked = state;
    storage_set_autosync_state(state);
}

function notifications_toggle(event) {
    storage_set_notifications(!storage_get_notifications());
    $('notifications_box').checked = storage_get_notifications();
}

function clear_updates(event) {
    storage_clear_changes();

    chrome.runtime.getBackgroundPage(function (background) {
        background.update_popup();
    });
}

function clear_storage(event) {
    if (confirm('Are you sure you\'d like to delete all cached data? Assuming it\'s still available on LMOD, it will be redownloaded during the next update (and you might be flooded with update notifications).')) {
        var classIds = storage_get_classes();
        for (var i = 0; i < classIds.length; i++) {
            storage_delete_class(classIds[i]);
        }
        storage_delete_classes();
        storage_clear_changes();

        chrome.runtime.getBackgroundPage(function (background) {
            background.update_popup();
        });
    }
}

function course_website_url(classId) {
    return 'https://learning-modules.mit.edu/portal/index.html?uuid=' + classId + '#assignments'
}

function toggle_class_visibility(classId) {
    set_class_visibility(classId, !storage_get_class_visibility(classId));
}

function set_class_visibility(classId, state) {
    var section = $id('class_' + classId);
    var ul = section.getElementsByTagName('ul')[0];

    if (state) {
        ul.style.display = 'block';
        section.getElementsByClassName('collapse_status')[0].innerText = SYMBOL_COLLAPSE;
    } else {
        ul.style.display = 'none';
        section.getElementsByClassName('collapse_status')[0].innerText = SYMBOL_EXPAND;
    }

    storage_set_class_visibility(classId, state);
}

function scroll_to_assignment(classId, assignmentId) {
    set_class_visibility(classId, true);
    $id('assignment_' + classId + '_' + assignmentId).scrollIntoView();
}

function update_display() {
    // auth status
    if (storage_get_auth_status() === 'failed') {
        $id('auth_error').style.display = 'block';
    } else {
        $id('auth_error').style.display = 'none';
    }

    // changes
    var changes = storage_get_changes();
    var classes = storage_get_classes_complete();
    if (changes.length > 0) {
        var updateBlock = $id('update_block');
        updateBlock.style.display = 'block';
        var updateList = $id('update_list');
        remove_all_children(updateList);

        changes.map(function (change) {
            var li = document.createElement('li');
            var verb = change.type === 'assignment_added' ? 'added' : 'updated';

            li.innerHTML = '<a href="#">' +
                classes[change.class].assignments[change.assignment].name +
                '</a> in ' +
                classes[change.class].name +
                ' ' +
                verb +
                ' <a href="' +
                course_website_url(change.class) +
                '" target="_blank">(go to course website)</a>.';

            li.getElementsByTagName('a')[0].addEventListener('click', function (event) {
                scroll_to_assignment(change.class, change.assignment);
                event.preventDefault();
            });

            updateList.appendChild(li);
        });
    } else {
        $id('update_block').style.display = 'none';
    }

    // classes and assignments
    var classOrder = storage_get_classes();
    var classBlock = $id('class_block');
    remove_all_children(classBlock);
    classOrder.map(function (classId) {
        var class_ = classes[classId];
        var section = document.createElement('section');
        section.id = 'class_' + classId;
        section.innerHTML = '<h2><span class="collapse_status"></span> ' +
            class_.name +
            ' (' +
            class_.longName +
            ') </h2><a href="' +
            course_website_url(classId) +
            '" target="_blank">course website</a><ul></ul>';

        var ul = section.getElementsByTagName('ul')[0];

        section.getElementsByTagName('h2')[0].addEventListener('click', function (event) {
            toggle_class_visibility(classId);
        });

        class_.assignmentIds.map(function (assignmentId) {
            var assignment = class_.assignments[assignmentId];

            var grade = assignment.grade || "??";
            var li = document.createElement('li');

            li.id = 'assignment_' + classId + '_' + assignmentId;

            var objects = [];
            if (assignment.assignmentCount > 0) {
                objects.push(assignment.assignmentCount + ' <i class="fa fa-download" title="assignment parts"></i>');
            }
            if (assignment.solutionCount > 0) {
                objects.push(assignment.solutionCount + ' <i class="fa fa-puzzle-piece" title="solution"></i>');
            }
            if (assignment.submissionCount > 0) {
                objects.push(assignment.submissionCount + ' <i class="fa fa-paperclip" title="submission"></i>');
            }
            if (assignment.commentCount > 0) {
                objects.push(assignment.commentCount + ' <i class="fa fa-comments" title="comments"></i>');
            }

            li.innerHTML = '<div><strong>' + assignment.name + '</strong>, due ' + assignment.dueDate + '</div>' +
                '<div>Grade: <strong>' + grade + '</strong>/' + assignment.maxGrade + '. ' +
                objects.join(', ') + '</div>';

            ul.appendChild(li);
        })

        classBlock.appendChild(section);
        set_class_visibility(classId, storage_get_class_visibility(classId));
    });
}

window.addEventListener('load', function() {
    $id('manual_sync').addEventListener('click', trigger_manual_sync);
    $id('clear_updates').addEventListener('click', clear_updates);
    $id('clear_storage').addEventListener('click', clear_storage);

    $id('autosync_box').addEventListener('click', autosync_toggle);
    $id('autosync_box').checked = storage_get_autosync_state();
    $id('notifications_box').addEventListener('click', notifications_toggle);
    $id('notifications_box').checked = storage_get_notifications();


    update_display();

    $id('')
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.type === 'popup_update') {
        update_display();
    }
});
