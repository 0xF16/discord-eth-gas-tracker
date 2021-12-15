const { Client, Intents } = require('discord.js');
const mysql = require('mysql-await');
const { ethers } = require('ethers');
const moment = require('moment');

const dotenv = require('dotenv');
dotenv.config();

const discord_token = process.env.DISCORD_TOKEN;
const connection = mysql.createConnection(`mysql://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}/${process.env.DB_NAME}?ssl=true`)

const client = new Client({ intents: [Intents.FLAGS.GUILDS] });
client.once('ready', () => {
	console.log('Ready!');

    const provider = new ethers.providers.WebSocketProvider(process.env.WS_RPC);
    provider.on('block', async (blockNumber) => {
        const block = await provider.getBlock(blockNumber);
        const baseFee = ethers.utils.formatUnits(block.baseFeePerGas, "gwei").split('.')[0];
        console.log(`New block: ${blockNumber}, baseFee: ${baseFee}`);

        let status;
        if(baseFee <= 80) {
            status = 'online';
        } else if(80 < baseFee && baseFee <= 120) {
            status = 'idle';
        } else {
            status = 'dnd';
        }
        client.user.setPresence({ activities: [{ name: `⛽: ${baseFee} gwei`, type: 'WATCHING' }], status: status });
        notifyUsers(baseFee);
    });
});

client.on('interactionCreate', async interaction => {
	if (!interaction.isCommand()) return;

	const { commandName } = interaction;

    const user = await client.users.fetch(interaction.user.id);

    console.log(`User: ${user.tag}, executed command: ${commandName}`)

	if (commandName === 'alert') {
        const alerts = await connection.awaitQuery(`
        SELECT id FROM \`discord-eth-gas-tracker\`
        WHERE discordId = ${interaction.user.id}`);

        if(alerts.length == 0) {
            await connection.awaitQuery(`
            INSERT INTO \`discord-eth-gas-tracker\` (discordId, baseFee, last_notification)
            VALUES (${interaction.user.id}, ${interaction.options.getInteger('gwei', true)}, ${moment().unix()});
            `);
            await connection.awaitCommit();
        } else {
            await connection.awaitQuery(`UPDATE \`discord-eth-gas-tracker\` SET baseFee = ${interaction.options.getInteger('gwei', true)} WHERE discordId = ${interaction.user.id}`);
            await connection.awaitCommit();
        }

        await interaction.reply({
            content: `You will be notified when gas price will be lower than ${interaction.options.getInteger('gwei', true)} gwei.`,
            ephemeral: true
        });
	} else if(commandName === 'alert_frequency') {
        const frequency = interaction.options.getString('frequency', true).split(' ');
        if (frequency.length != 2
            || parseInt(frequency[0] == Number.NaN)
            || ['s', 'second', 'seconds',
            'm', 'minute', 'minutes',
            'h', 'hour', 'hours',
            'd', 'day', 'days'].indexOf(frequency[1]) == -1) {
            await interaction.reply({
                content: `Wrong time provided. Please use following format \`<number> <second(s)|minute(s)|hour(s)|day(s)>\``,
                ephemeral: true
            });
            return;
        }

        const time = moment.duration(frequency[0], frequency[1]) / 1000; //convert to seconds

        await connection.awaitQuery(`UPDATE \`discord-eth-gas-tracker\` SET frequency = ${time}, last_notification = 0 WHERE discordId = ${interaction.user.id}`);
        await connection.awaitCommit();
        await interaction.reply({
            content: `Frequency set at ${frequency[0]} ${frequency[1]}.`,
            ephemeral: true
        });
    }
});

client.login(discord_token);

async function notifyUsers(gwei) {
    const users = await connection.awaitQuery(`SELECT id, discordId, last_notification, frequency, baseFee FROM \`discord-eth-gas-tracker\` WHERE baseFee >= ${gwei}`);
    for (const i in users) {
        if(parseInt(parseInt(users[i].last_notification) + parseInt(users[i].frequency)) > moment().unix()) return;

        const user = await client.users.fetch(users[i].discordId);
        await connection.awaitQuery(`UPDATE \`discord-eth-gas-tracker\` SET last_notification = ${moment().unix()} WHERE id = ${users[i].id}`);
        await connection.awaitCommit();
        console.log(`Notified: ${user.tag}`);
        user.send(`Gas price is bellow set level of ${users[i].baseFee} gwei. Currently ⛽ is: ${gwei} gwei`);
    }
}