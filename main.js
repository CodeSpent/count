// Copyright (C) 2018 Sacra Volskaya

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//     http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

const Discord = require("discord.js");
const Config = require("./config.json");

(function() {  // Encapsulate bot, just in case
  // Add guards to Config variables
  const config = {
    token: Config.token || '',
    server: Config.server || '',
    cooldown: Config.cooldown || 10,  // Default to 10 seconds
    totalChannel: {
      id: Config.totalChannel.id || '',
      name: Config.totalChannel.name || ''
    },
    onlineChannel: {
      id: Config.onlineChannel.id || '',
      name: Config.onlineChannel.name || ''
    },
    botChannel: {
      id: Config.botChannel.id || '',
      name: Config.botChannel.name || ''
    }
  }

  console.log(`Cooldown set to ${config.cooldown} seconds`);

  let server = null,  // Assigned, after bot is ready and correct server ID found
      cooling = false,  // Set true in updateCounters(), set false in timer
      pending = false,  // If the cooldown was hit, queue up another update
      updates = 0;  // Count dispatched updates

  const state = {
    members: 0,
    users: 0,
    bots: 0,
  };

  const channels = {
    totalCount: {
      id: config.totalChannel.id,
      ref: null,
      state: 'members',
      name: config.totalChannel.name
    },
    onlineCount: {
      id: config.onlineChannel.id,
      ref: null,
      state: 'users',
      name: config.onlineChannel.name
    },
    botCount: {
      id: config.botChannel.id,
      ref: null,
      state: 'bots',
      name: config.botChannel.name
    }
  };

  const formatMetrics = () => `Total members - ${state.members}, `
        + `Online users - ${state.users}, `
        + `Bots - ${state.bots}`;

  // Count both of them, to avoid iterating too many times
  const getMetrics = () => {
    if (server === null) return [0, 0, 0];

    let members = server.members.size,
        users = 0,
        bots = 0;

    server.members.map(m => {
      if (m.user.bot) bots++;
      else if (m.presence.status !== 'offline') users++;
    });

    return [members, users, bots];
  };

  // Recalculate metrics
  const invalidateState = () => {
    const [members, users, bots] = getMetrics();

    state.members = members;
    state.users = users;
    state.bots = bots;
  };

  // Iterate trough available servers and update their counters
  // It also recalculates metrics within the same loop
  const updateCounters = async () => {
    if (cooling) {
      // Queue up another update, if the cooldown was hit and return early
      pending = true; return;
    } else if (config.cooldown !== 0) {  // Disabled, if cooldown == 0
      cooling = true;

      // Most likely an infinite loop on big servers
      setTimeout(() => {
        cooling = false;

        if (pending) {  // Cooldown was hit, update
          pending = false;
          updateCounters();
        }
      }, config.cooldown * 1000);
    }

    invalidateState();  // Update metrics, before setting channel names

    console.log(`[${updates}] Updating counters…`);
    console.log(formatMetrics());
    updates++;

    await Promise.all(
      Object.values(channels).map(async channel => {
        if (channel.ref != null) {
          await channel.ref.setName(`${channel.name} : ${state[channel.state]}`)
                       .catch(err => {
                         if (err.code == 50001)
                           console.log('Bot does not have enough permissions '
                                       + `to modify #${channel.ref.name}`);
                       });
        } else {
          console.log(`Tried to update ${channel.name} count, `
                      + 'but the reference to the channel is missing');
        }
      }));
  };

  // Will print every channel and its ID within the Config.server
  // Use the output to get the references for counter channels
  const assignReferences = () => {
    let i = 0;

    console.log(`Connected to ${server.name}, available channels:`);

    server.channels.forEach(channel => {
      console.log(`    [${i}] ${channel.name}, id - ${channel.id}`);
      i++;

      Object.keys(channels).forEach(key => {
        if (channel.id == channels[key].id) {
          console.log(`Reference found for ${channels[key].name}`);
          channels[key].ref = channel;
        }
      })
    });

    console.log('');  // New line
  }

  if (config.token === '') {
    console.error('Please add a valid token to config.json');
    process.exit();
  } else if (config.server === '') {
    console.error('Please add a valid server id to config.json');
    process.exit();
  }

  const bot = new Discord.Client();

  // Callbacks
  bot.on("ready", () => {
    console.log(`Bot logged in as ${bot.user.username}\n`);

    try {
      server = bot.guilds.get(config.server);
    } catch(e) {
      console.log(`Bot is not added to server ID - ${config.server}.`);
      console.log('Exitting…');
      bot.destroy();

      return;  // Return early, so below functions don't get called
    }

    assignReferences();
    updateCounters();  // Force update, when the bot is ready
  });

  bot.on('guildMemberAdd', updateCounters);
  bot.on('guildMemberAvailable', updateCounters);
  bot.on('guildMemberRemove',  updateCounters);
  bot.on('guildMemberUpdate', updateCounters);
  bot.on('presenceUpdate', updateCounters);

  // Set meters to "Off", before exiting…
  process.on('SIGINT', async () => {
    console.log('Shutting down the bot…');

    await Promise.all(Object.values(channels).map(async channel => {
      if (channel.ref != null) {
        await channel.ref.setName(`${channel.name} : Off`)
      }
    })).catch(() => {}); // Don't care

    // Exit, after above Promise is done
    process.exit();
  });

  bot.login(Config.token);  // Login
})();
