'use strict';

const _ = require('lodash');
const request = require('request');
const log = require('npmlog');
const LOG_PREFIX = 'parse-server-imcmp-push';

function IMCPush(config) {
    this.config = config;
}

IMCPush.generateNotificationAction = function (params) {
    var notificationAction;
    if (params.link) {
        notificationAction = {
            'type': 'url',
            'name': 'Open',
            'value': params.link
        };
    } else {
        notificationAction = {
            'type': 'openApp',
            'name': 'Open',
            'value': ''
        };
    }
    return notificationAction;
}

IMCPush.generateAPNSPayload = function (params) {
    var notificationAction = IMCPush.generateNotificationAction(params);
    return {
        'aps': {
            'alert': {
                'title': params.subject,
                'body': params.alert
            },
            'badge': params.badge,
            'sound': params.sound,
            "mutable-content" : 1
        },
        'notification-action': notificationAction,
        'category-actions': [
            notificationAction
        ],
        'media-attachment': params.poster
    };
}

IMCPush.generateGCMPayload = function (params) {
    var notificationAction = IMCPush.generateNotificationAction(params);
    return {
        'alert': {
            'subject': params.subject,
            'message': params.alert,
            'notification-action': notificationAction,
            'icon': params.icon,
            'expandable': {
                'type': 'image',
                'value': params.poster,
                'expandable-actions': [
                    notificationAction
                ]
            }
        }
    };
}

IMCPush.prototype.generateIMCPayload = function (appKey, msgPayload, devices) {
    var config = this.config;
    if (!devices || devices.length == 0) {
        return null;
    }
    var channelFields = _.uniqWith(devices.map(function (dev) {
        return {
            channel: {
                qualifier: appKey,
                destination: dev.userId + '|' + dev.channelId
            }
        };
    }), _.isEqual);
    var payload = {
        'channelQualifiers': [
            appKey
        ],
        'content': {
            'contentId': null,
            'simple': msgPayload
        },
        'contacts': channelFields,
        'campaignName': config.campaignName
    };
    return payload;
}

IMCPush.prototype.auth = function (accessToken) {
    var config = this.config;
    return new Promise(function (resolve, reject) {
        // TODO validate accessToken
        if (accessToken) {
            return resolve({
                access_token: accessToken
            });
        }
        request.post(config.oauthTokenRequestUrl, {
            form: {
                grant_type: 'refresh_token',
                client_id: config.clientId,
                client_secret: config.clientSecret,
                refresh_token: config.refreshToken
            }
        }, function (err, httpResponse, body) {
            if (err) {
                console.error('failed to fetch access token.', err);
                return reject(err);
            }

            log.verbose(LOG_PREFIX, 'push auth result', body);
            try {
                var bodyObj = JSON.parse(body);
                return resolve(bodyObj);
            } catch (error) {
                console.error('failed to parse body for access token.', error);
                return reject(error);
            }
        });
    });
}

IMCPush.prototype.publish = function (payload, accessToken, devices) {
    var config = this.config;
    return new Promise(function (resolve, reject) {
        request.post(config.restChannelsPushSendsRequestUrl, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + accessToken
            },
            json: true,
            body: payload
        }, function (err, httpResponse, body) {
            if (err) {
                console.error('failed to do channel push send.', err);
                return reject(err);
            }

            log.verbose(LOG_PREFIX, 'push publish result', body);
            try {
                return resolve(body);
            } catch (error) {
                console.error('failed to parse body of channel push send.', error);
                return reject(error);
            }
        });
    });
}

module.exports = IMCPush;
module.exports.default = IMCPush;