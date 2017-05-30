# parse-server-imcmp-adapter

### Parse IMC Mobile Push Adapter

This adapter can be used with Parse open source to leverage the IBM Marketing Cloud and Mobile Push (IMCMP), which attempts to abstract away the complexities of different push notification systems.  Currently, there is only support for iOS (Apple Push Notification Service) and Android (Google Cloud Messaging) devices.

To add other push types, you simply need to know what kind of payload format to be sent and this adapter will need to be modified to send it.  This adapter leverages code from the [parse-server-push-adapter](https://github.com/parse-server-modules/parse-server-push-adapter) repo.