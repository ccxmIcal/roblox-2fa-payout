const axios = require('axios');
const base64 = require('base-64');
const { authenticator } = require('otplib');

const roblosecurity = "";
const group_id = 1;
const user_id = 1;
const robux_amount = 1;
const twofactor_secret = "";

const headers = { Cookie: `.ROBLOSECURITY=${roblosecurity}` };

function getTotp() {
    return authenticator.generate(twofactor_secret);
}

async function setCsrf() {
    try{
        const request = await axios.post("https://auth.roblox.com/v2/logout", {}, { headers });

        if (request.status === 401) {
            console.log("Incorrect cookie");
            process.exit(0);
        }
    
        headers['x-csrf-token'] = request.headers['x-csrf-token'];
        console.log(headers['x-csrf-token'])
    } catch(error){
        console.log(`CSRF Token: ${error.response.headers['x-csrf-token']}`);
        headers['x-csrf-token'] = error.response.headers['x-csrf-token'];
    }

}

async function payoutRequest() {
    try{
        const request = await axios.post(`https://groups.roblox.com/v1/groups/${group_id}/payouts`, {
            PayoutType: "FixedAmount",
            Recipients: [
                {
                    amount: robux_amount,
                    recipientId: user_id,
                    recipientType: "User"
                }
            ]
        }, { headers });
        if(request.status === 200){
            console.log("Robux successfully sent!");
            return false;
        }
    } catch(error){
        if(error.status === 403 && error.response.data.errors[0].message === "Challenge is required to authorize the request"){
            console.log(`Got 403. Returning challengeid!`);
            return error.response;
        } else{
            console.log("Payout error!");
            return false
        }
    }
}

async function verifyRequest(senderId, metadata_challengeId) {
    const request = await axios.post(`https://twostepverification.roblox.com/v1/users/${senderId}/challenges/authenticator/verify`, {
        actionType: "Generic",
        challengeId: metadata_challengeId,
        code: getTotp()
    }, { headers });

    if (request.data.errors) {
        console.log("2fa error");
        console.log(request.data.errors[0].message);
        process.exit(0);
    }
    return request.data.verificationToken;
}

async function continueRequest(challengeId, verification_token, metadata_challengeId) {
    await axios.post("https://apis.roblox.com/challenge/v1/continue", {
        challengeId: challengeId,
        challengeMetadata: JSON.stringify({
            rememberDevice: false,
            actionType: "Generic",
            verificationToken: verification_token,
            challengeId: metadata_challengeId
        }),
        challengeType: "twostepverification"
    }, { headers });
}

(async () => {
    await setCsrf();

    const data = await payoutRequest();
    if (!data) process.exit(0);

    const challengeId = data.headers["rblx-challenge-id"];
    const metadata = JSON.parse(base64.decode(data.headers["rblx-challenge-metadata"]));
    const metadata_challengeId = metadata.challengeId;
    const senderId = metadata.userId;

    const verification_token = await verifyRequest(senderId, metadata_challengeId);

    await continueRequest(challengeId, verification_token, metadata_challengeId);

    headers['rblx-challenge-id'] = challengeId;
    headers['rblx-challenge-metadata'] = base64.encode(JSON.stringify({
        rememberDevice: false,
        actionType: "Generic",
        verificationToken: verification_token,
        challengeId: metadata_challengeId
    }));
    headers['rblx-challenge-type'] = "twostepverification";

    await payoutRequest();
})();