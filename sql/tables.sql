CREATE TABLE `discord-eth-gas-tracker` (
  `id` int NOT NULL AUTO_INCREMENT,
  `baseFee` int unsigned DEFAULT NULL,
  `discordId` varchar(255) DEFAULT NULL,
  `frequency` int unsigned DEFAULT '60',
  `last_notification` int unsigned DEFAULT NULL,
  PRIMARY KEY (`id`)
)