const { ActivityType } = require("discord.js");

module.exports = (client) => {
  //Retorno de conexão do bot
  console.log(`${client.user.tag} está online.`);

  client.user.setPresence({
    activities: [{ name: "/ajuda", type: ActivityType.Listening }],
    status: "online",
  });
};
