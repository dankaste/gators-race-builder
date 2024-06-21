const toLevel = require("./level");
const moment = require("moment/moment");
const csv = require("csvtojson");
module.exports = {
    getRoster: async function(config) {
        const csvRosterData = await csv().fromFile(config.rosterFilePath);
        const riders = csvRosterData.map(entry => ({
            id: entry['id'],
            firstName: entry['player_first_name'],
            lastName: entry['player_last_name'],
            plateNumber: entry['number'],
            gender: entry['gender'],
            email: entry['parent1_email'],
            parent: `${entry['parent1_first_name']} ${entry['parent1_last_name']}`,
            level: toLevel.default(entry['team']),
            phone: entry['parent1_mobile_number'] || entry['parent2_mobile_number'],
            age: moment(config.raceDate).diff(entry['birth_date'], 'years')
        }));
        console.log(`Loaded ${riders.length} riders from Roster`)
        return riders;
    },
    getConfig: async function() {
        const readYamlFile = require('read-yaml-file')
        return await readYamlFile('./config.yml');
    },
    getRegisteredRiders: async function(config, riders) {
        const csvRegistrations = await csv().fromFile(config.raceRegistrationFilePath);
        const registeredIds = csvRegistrations.filter(entry => entry['status'] !== "Canceled").map(entry => ({id: entry['player_id'], distance: entry['package_name']}));
        console.log(`${registeredIds.length} riders registered from race`)
        const registeredRiders = registeredIds.map(ri => {
            const rider = riders.find(r => r.id === ri.id);
            if (rider === null || rider === undefined) {
                console.log(`No roster rider found for registered id ${ri.id}`);
                return ri;
            }
            rider.distance = ri.distance;
            return rider;
        });

        return registeredRiders;
    },
    getWebscorerRegistrations: async function(config) {
        const webscorerExportData = await csv().fromFile(config.webscorerRegistrationFilePath);

        const webscorerRiders = webscorerExportData.map(entry => ({
            firstName: entry['First name'],
            lastName: entry['Last name'],
            plateNumber: entry['Race Plate Number (leave blank if you need a plate)'],
            gender: entry['Gender'] === "Male" ? "M" : "F",
            email: entry['Email'],
            phone: entry['Emergency contact phone #'],
            parent: entry['Guardian signature'],
            level: 1,
            distance: entry['Distance'],
            age: moment(config.raceDate).diff(entry['Date of birth'], 'years')
        }));

        console.log(`Loaded ${webscorerRiders.length} riders from Webscorer`);
        return webscorerRiders;
    }

}