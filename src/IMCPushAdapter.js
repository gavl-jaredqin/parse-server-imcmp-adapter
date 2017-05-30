"use strict";
// IMCAdapter
//
// Uses IMC for push notification
const IMCPush = require('./IMCPush');

const Parse = require('parse/node').Parse;

const log = require('npmlog');
const LOG_PREFIX = 'parse-server-imcmp-adapter';

function IMCPushAdapter(config) {
    this.config = config;
    this.validPushTypes = ['ios', 'android'];
    this.availablePushTypes = [];
    this.pushConfig = config.pushTypes;
    this.senderMap = {};

    if (!config.refreshToken || !config.clientId || !config.clientSecret) {
        throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED,
            'Need to provide IMC clientId, clientSecret and refreshToken.');
    }

    if (config.pushTypes) {
        let pushTypes = Object.keys(config.pushTypes);
        for (let pushType of pushTypes) {
            if (this.validPushTypes.indexOf(pushType) < 0) {
                throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED,
                    'Push to ' + pushTypes + ' is not supported');
            }
            this.availablePushTypes.push(pushType);
            switch (pushType) {
                case 'ios':
                    this.senderMap[pushType] = this.sendToAPNS.bind(this);
                    break;
                case 'android':
                    this.senderMap[pushType] = this.sendToGCM.bind(this);
                    break;
            }
        }
    }

    // Instantiate after config is setup.
    this.push = new IMCPush({
        oauthTokenRequestUrl: config.oauthTokenRequestUrl,
        restChannelsPushSendsRequestUrl: config.restChannelsPushSendsRequestUrl,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        refreshToken: config.refreshToken,
        campaignName: config.campaignName
    });
}


IMCPushAdapter.prototype.getValidPushTypes = function () {
    return this.availablePushTypes;
}

IMCPushAdapter.classifyInstallations = function (installations, validPushTypes) {
  // Init deviceTokenMap, create a empty array for each valid pushType
  var deviceMap = {};
  var _iteratorNormalCompletion = true;
  var _didIteratorError = false;
  var _iteratorError = undefined;

  try {
    for (var _iterator = validPushTypes[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
      var validPushType = _step.value;

      deviceMap[validPushType] = [];
    }
  } catch (err) {
    _didIteratorError = true;
    _iteratorError = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion && _iterator.return) {
        _iterator.return();
      }
    } finally {
      if (_didIteratorError) {
        throw _iteratorError;
      }
    }
  }

  var _iteratorNormalCompletion2 = true;
  var _didIteratorError2 = false;
  var _iteratorError2 = undefined;

  try {
    for (var _iterator2 = installations[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
      var installation = _step2.value;

      // No deviceToken, ignore
      if (!installation.channelId || !installation.userId) {
        continue;
      }
      var devices = deviceMap[installation.pushType] || deviceMap[installation.deviceType] || null;
      if (Array.isArray(devices)) {
        devices.push({
          channelId: installation.channelId,
          userId: installation.userId
        });
      }
    }
  } catch (err) {
    _didIteratorError2 = true;
    _iteratorError2 = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion2 && _iterator2.return) {
        _iterator2.return();
      }
    } finally {
      if (_didIteratorError2) {
        throw _iteratorError2;
      }
    }
  }

  return deviceMap;
}

IMCPushAdapter.generateiOSPayload = function (data) {
    var notification = IMCPush.generateAPNSPayload(data.data);
    var payload = {};
    payload['apns'] = notification;
    return payload;
}

IMCPushAdapter.generateAndroidPayload = function (data) {
    var notification = IMCPush.generateGCMPayload(data.data);
    var payload = {};
    payload['gcm'] = notification;
    return payload;
}

IMCPushAdapter.prototype.generateIMCPayload = function (appKey, payload, devices) {
    return this.push.generateIMCPayload(appKey, payload, devices);
}

IMCPushAdapter.prototype.sendToAPNS = function (data, devices) {
    var iosPayload = IMCPushAdapter.generateiOSPayload(data);
    var iosPushConfig = this.pushConfig['ios'];
    if (data.accessToken) {
        iosPushConfig.accessToken = data.accessToken;
    }

    return this.sendToIMC(iosPayload, devices, iosPushConfig);
}

IMCPushAdapter.prototype.sendToGCM = function (data, devices) {
    var androidPayload = IMCPushAdapter.generateAndroidPayload(data);
    var androidPushConfig = this.pushConfig['android'];
    if (data.accessToken) {
        androidPushConfig.accessToken = data.accessToken;
    }

    return this.sendToIMC(androidPayload, devices, androidPushConfig);
}

// Exchange the access token for the IMC sender
IMCPushAdapter.prototype.sendToIMC = function (payload, devices, devPushConfig) {
    return this.push.auth(devPushConfig.accessToken).then(exchangeResponse => {
        if (exchangeResponse.access_token) {
            return this.sendIMCPayload(exchangeResponse.access_token, payload, devices, devPushConfig);
        } else {
            log.error(LOG_PREFIX, 'access token was not returned.');
            throw new Error('access token was not returned');
        }
    }).catch(function (error) {
        log.error(LOG_PREFIX, 'failed to send to IMC.', error);
    });
}

/**
 * Send the Message, MessageStructure, and Target IMC Resource Number (ARN) to IMC
 * @param accessToken IMC access token
 * @param payload JSON-encoded message
 * @param device Device info (used for returning push status)
 * @returns {Parse.Promise}
 */
IMCPushAdapter.prototype.sendIMCPayload = function (accessToken, payload, devices, devPushConfig) {
    var payload = this.generateIMCPayload(devPushConfig.appKey, payload, devices);

    if (payload) {
        log.verbose(LOG_PREFIX, 'payload', JSON.stringify(payload, null, 4));
        return this.push.publish(payload, accessToken, devices);
    } else {
        log.info(LOG_PREFIX, 'skip to send push.');
        return Promise.resolve();
    }
}

/* For a given config object, endpoint and payload, publish via IMC
 * Returns a promise containing the IMC object publish response
 */
IMCPushAdapter.prototype.send = function (data, installations) {
    let deviceMap = IMCPushAdapter.classifyInstallations(installations, this.availablePushTypes);

    let sendPromises = Object.keys(deviceMap).map((pushType) => {
        var devices = deviceMap[pushType];
        if (devices && devices.length > 0) {
            var sender = this.senderMap[pushType];
            return sender(data, devices);
        }
    });

    return Parse.Promise.when(sendPromises);
}

module.exports = IMCPushAdapter;
module.exports.default = IMCPushAdapter;