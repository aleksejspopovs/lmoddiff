lmoddiff
========

Overview
--------

![screenshot](http://web.mit.edu/~aleksejs/www/screenshots/lmoddiff.png)

lmoddiff is a Chromium extension that downloads assignment data from [LMOD](https://learning-modules.mit.edu), one of MIT's course management systems. When it notices that a new assignment has been created or an existing assignment has been updated (e.g. the grade changed, the solutions uploaded, etc), it will notify you by displaying the number of changes on its icon and also (optionally) showing a notification.

lmoddiff relies on you being authenticated to LMOD. If lmoddiff detects that you're not authenticated, it will try to auto-authenticate you, which will work if you're already authenticated to Shibboleth and Duo. Essentially, lmoddiff's auto-auth will work if and only if just pressing “Login” on LMOD works to authenticate you without you needing to choose your authentication method, choose your certificate, authenticate through Duo, etc. If that is the case, lmoddiff will also solve the problem of LMOD randomly deauthenticating you all the time.

Installing
----------

lmoddiff can be installed from [the Google Web Store](https://chrome.google.com/webstore/detail/lmoddiff/nnggdchankfbnjdjfigkcpfhkhfibhhe), and will update automatically.

Licensing
---------

lmoddiff is available under the terms of the MIT License, available in the file named `LICENSE` in this repository.

[Font Awesome](http://fontawesome.io), parts of which are included in this repository and in distributions of lmoddiff, is available under the terms of the MIT License (for CSS) and SIL OFL 1.1 (for the fonts). More information about Font Awesome's licenses is available on their [website](http://fontawesome.io/license/).

