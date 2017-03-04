// LMOD API

function lmod_get(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function () {
        if (xhr.readyState == 4) {
            callback(JSON.parse(xhr.responseText));
        }
    };
    xhr.open('GET', 'https://learning-modules.mit.edu/service/' + url, true);
    xhr.send();
}

function lmod_user(callback) {
    lmod_get('membership/user', callback);
}

function lmod_classes(callback) {
    lmod_get('membership/groups', callback);
}

function lmod_gradebook_info(uuid, callback) {
    lmod_get('gradebook/gradebook?uuid=STELLAR:' + uuid, callback);
}

function lmod_gradebook_role(gradebookId, callback) {
    lmod_get('gradebook/role/' + gradebookId + '?includePermissions=false', callback);
}

function lmod_gradebook(gradebookId, personId, callback) {
    lmod_get('gradebook/student/' + gradebookId + '/' + personId + '/1?' +
        'includeGradeInfo=true' +
        '&includeAssignmentMaxPointsAndWeight=true' +
        '&includePhoto=false' +
        '&includeGradeHistory=false' +
        '&includeCompositeAssignments=true' +
        '&includeAssignmentGradingScheme=true' +
        '&convertGradesToParentGradingScheme=true', callback);
}

function lmod_gradebook_assignments(gradebookId, callback) {
    lmod_get('materials/gradebook/' + gradebookId + '/homework/summary', callback);
}

function lmod_gradebook_submissions(gradebookId, callback) {
    lmod_get('materials/gradebook/' + gradebookId + '/summary', callback);
}

// STORAGE LOGIC

function storage_get_class(classId) {
    var key = 'lmod_class_' + classId;
    if (localStorage[key] === undefined) {
        return undefined;
    }
    return JSON.parse(localStorage['lmod_class_' + classId]);
}

function storage_save_class(classId, classInfo) {
    var key = 'lmod_class_' + classId;

    if (localStorage[key] === undefined) {
        if (localStorage.lmod_classes === undefined) {
            localStorage.lmod_classes = JSON.stringify([]);
        }
        var lmod_classes = JSON.parse(localStorage.lmod_classes);
        lmod_classes.push(classId);
        localStorage.lmod_classes = JSON.stringify(lmod_classes);
    }
    localStorage[key] = JSON.stringify(classInfo);
}

function storage_get_changes() {
    return JSON.parse(localStorage.lmod_changes || '[]');
}

function storage_push_changes(changes) {
    var key = 'lmod_changes';

    var old_changes = JSON.parse(localStorage[key] || '[]');
    localStorage[key] = JSON.stringify(old_changes.concat(changes));
}

function storage_get_auth_status() {
    return localStorage.lmod_auth_status;
}

function storage_set_auth_status(status) {
    localStorage.lmod_auth_status = status;
}

function storage_get_autosync_state() {
    return !(localStorage['autosync'] === 'false');
}

function storage_get_notifications() {
    return localStorage['notifications'] === 'true';
}

// SYNCHRONIZATION LOGIC

function get_auth_url() {
    return 'https://learning-modules.mit.edu/Shibboleth.sso/Login?target=https%3A%2F%2Flearning-modules.mit.edu%2F';
}

function try_auth() {
    document.getElementById('auth_iframe').src = get_auth_url();
}

function update_popup(suppressNotification) {
    var changes = storage_get_changes();
    if (storage_get_auth_status() === 'failed') {
        chrome.browserAction.setBadgeText({text: '!!'});
        chrome.browserAction.setBadgeBackgroundColor({color: '#FF9E80'});
    } else if (changes.length > 0) {
        chrome.browserAction.setBadgeText({text: changes.length.toString()});
        chrome.browserAction.setBadgeBackgroundColor({color: '#15c398'});
    } else {
        chrome.browserAction.setBadgeText({text: ''});
    }

    if (storage_get_notifications() && (!suppressNotification)) {
        if (storage_get_auth_status() === 'failed') {
            chrome.notifications.create('lmod_auth_failure', {
                type: 'basic',
                iconUrl: 'icons/icon_128.png',
                title: 'LMOD Authentication failure',
                message: 'lmoddiff could not access LMOD. Open the popup to learn more.'
            });
        }
        if ((storage_get_auth_status() === 'ok') && (changes.length > 0)) {
            chrome.notifications.create('lmod_update', {
                type: 'basic',
                iconUrl: 'icons/icon_128.png',
                title: 'Updates in LMOD',
                message: 'You have new updates in LMOD. Open the popup to see them.'
            });
        }
    }

    chrome.runtime.sendMessage({type: 'popup_update'});
}

function synchronize_assignments(retrying) {
    lmod_user(function (userData) {
        // check if the user is authenticated

        if (userData.response.numFound == 0) {
            if (retrying) {
                storage_set_auth_status('failed');
                update_popup();
            } else {
                storage_set_auth_status('unknown');
                update_popup(true);
                try_auth();
                chrome.alarms.create('sync_retry', {delayInMinutes: 1});
            }

        } else {
            storage_set_auth_status('ok');
            update_popup(true);

            var user = userData.response.docs[0];

            lmod_classes(function (classes) {
                // get the list of classes the user is enrolled in

                classes.response.docs.map(function (class_) {
                    if (class_.role !== 'Student') {
                        return;
                    }

                    // this is where we know the user is taking this class
                    if (storage_get_class(class_.uuid) === undefined) {
                        var classInfo = {
                            name: class_.name,
                            longName: class_.longName,
                            assignments: {},
                            assignmentIds: []
                        };
                        storage_save_class(class_.uuid, classInfo);
                    }

                    lmod_gradebook_info(class_.uuid, function (gradebookInfo) {
                        var gradebookId = gradebookInfo.data.gradebookId;

                        lmod_gradebook_role(gradebookId, function (role) {
                            var personId = role.data.person.personId;

                            lmod_gradebook(gradebookId, personId, function (gradebook) {
                                // this is where we get the list of assignments & grades
                                // the following calls get more details about them

                                var classInfo = storage_get_class(class_.uuid);

                                var updatedAssignments = {};

                                for (var i = 0; i < gradebook.data.studentAssignmentInfo.length; i++) {
                                    var assignment = gradebook.data.studentAssignmentInfo[i];

                                    if (!assignment.isHomework)
                                        continue;

                                    if (!(assignment.assignmentId in classInfo.assignments)) {
                                        classInfo.assignmentIds.push(assignment.assignmentId);
                                        classInfo.assignments[assignment.assignmentId] = {
                                            name: assignment.name,
                                            dueDate: assignment.dueDateString,
                                            maxGrade: assignment.maxPointsTotal,
                                            grade: assignment.gradeString,

                                            assignmentCount: 0,
                                            solutionCount: 0,
                                            submissionCount: 0,
                                            commentCount: 0,
                                        };

                                        updatedAssignments[assignment.assignmentId] = 'added';
                                    } else {
                                        var old_assignment = classInfo.assignments[assignment.assignmentId];

                                        if (old_assignment.dueDate !== assignment.dueDateString) {
                                            old_assignment.dueDate = assignment.dueDateString;
                                            if (!(assignment.assignmentId in updatedAssignments))
                                                updatedAssignments[assignment.assignmentId] = 'updated';
                                        }

                                        if (old_assignment.maxGrade !== assignment.maxPointsTotal) {
                                            old_assignment.maxGrade = assignment.maxPointsTotal;
                                            if (!(assignment.assignmentId in updatedAssignments))
                                                updatedAssignments[assignment.assignmentId] = 'updated';
                                        }

                                        if (old_assignment.grade !== assignment.gradeString) {
                                            old_assignment.grade = assignment.gradeString;
                                            if (!(assignment.assignmentId in updatedAssignments))
                                                updatedAssignments[assignment.assignmentId] = 'updated';
                                        }
                                    }
                                }

                                var counter = 0;
                                function finalize() {
                                    storage_save_class(class_.uuid, classInfo);

                                    var changes = [];
                                    for (var id in updatedAssignments) {
                                        changes.push({
                                            type: 'assignment_' + updatedAssignments[id],
                                            class: class_.uuid,
                                            assignment: parseInt(id)
                                        });
                                    }
                                    storage_push_changes(changes);

                                    if (changes.length > 0) {
                                        update_popup();
                                    }
                                }

                                lmod_gradebook_assignments(gradebookId, function (assignments) {
                                    for (var id in assignments) {
                                        if (!(id in classInfo.assignments)) {
                                            continue;
                                        }

                                        var old_assignment = classInfo.assignments[id];

                                        if ((assignments[id].assignment !== undefined) &&
                                            (old_assignment.assignmentCount !== assignments[id].assignment)) {
                                            old_assignment.assignmentCount = assignments[id].assignment;
                                            if (!(id in updatedAssignments))
                                                updatedAssignments[id] = 'updated';
                                        }

                                        if ((assignments[id].solution !== undefined) &&
                                            (old_assignment.solutionCount !== assignments[id].solution)) {
                                            old_assignment.solutionCount = assignments[id].solution;
                                            if (!(id in updatedAssignments))
                                                updatedAssignments[id] = 'updated';
                                        }
                                    }

                                    counter++;
                                    if (counter == 2) {
                                        finalize();
                                    }
                                });

                                lmod_gradebook_submissions(gradebookId, function (submissions) {
                                    for (var id in submissions) {
                                        if (!(id in classInfo.assignments)) {
                                            continue;
                                        }

                                        var old_assignment = classInfo.assignments[id];

                                        if ((submissions[id].submissions !== undefined) &&
                                            (old_assignment.submissionCount !== submissions[id].submissions)) {
                                            old_assignment.submissionCount = submissions[id].submissions;
                                            if (!(id in updatedAssignments))
                                                updatedAssignments[id] = 'updated';
                                        }
                                        if ((submissions[id].comments !== undefined) &&
                                            (old_assignment.commentCount !== submissions[id].comments)) {
                                            old_assignment.commentCount = submissions[id].comments;
                                            if (!(id in updatedAssignments))
                                                updatedAssignments[id] = 'updated';
                                        }
                                    }


                                    counter++;
                                    if (counter == 2) {
                                        finalize();
                                    }
                                });
                            });
                        });
                    });
                });
            });
        }
    })
}

chrome.alarms.onAlarm.addListener(function (alarm) {
    if (alarm.name === 'sync_retry') {
        synchronize_assignments(true);
    }
    if (alarm.name === 'autosync') {
        synchronize_assignments();
    }
});

window.addEventListener('load', function() {
    update_popup();

    if (storage_get_autosync_state()) {
        chrome.alarms.create('autosync', {
            periodInMinutes: 15
        });
    }
});
