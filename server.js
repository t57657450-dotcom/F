const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_FOOTBALL_KEY;

if (!API_KEY) {
    console.warn("⚠️ API_FOOTBALL_KEY تنظیم نشده است.");
}

app.use(express.json());
app.use(express.static("."));

async function footballAPI(url) {

    const response = await fetch(
        "https://v3.football.api-sports.io" + url,
        {
            headers: {
                "x-apisports-key": API_KEY
            }
        }
    );

    if (!response.ok) {
        throw new Error(
            "API Football Error: " + response.status
        );
    }

    return await response.json();
}


/* جستجوی بازیکن */

async function findPlayer(name) {

    const data = await footballAPI(
        "/players?search=" +
        encodeURIComponent(name) +
        "&season=2026"
    );

    if (
        !data.response ||
        !data.response.length
    ) {
        return null;
    }

    return data.response[0];
}


/* عدد امن */

function num(value, fallback = 0) {

    const n = Number(value);

    return Number.isFinite(n) ? n : fallback;

}


/*
قدرت بازیکن

این Rating ساختگی FIFA نیست.
از آمار واقعی API محاسبه می‌شود.
*/

function calculatePlayerPower(playerData) {

    const stats =
        playerData.statistics?.[0];

    if (!stats) {
        return 50;
    }


    const games =
        stats.games || {};

    const goals =
        stats.goals || {};

    const shots =
        stats.shots || {};

    const passes =
        stats.passes || {};

    const tackles =
        stats.tackles || {};

    const dribbles =
        stats.dribbles || {};

    const duels =
        stats.duels || {};

    const cards =
        stats.cards || {};


    const appearances =
        num(games.appearances);

    const rating =
        num(games.rating, 6.5);

    const goalsTotal =
        num(goals.total);

    const assists =
        num(goals.assists);

    const shotsTotal =
        num(shots.total);

    const shotsOn =
        num(shots.on);

    const passesTotal =
        num(passes.total);

    const passesAccuracy =
        num(passes.accuracy);

    const tacklesTotal =
        num(tackles.total);

    const dribblesSuccess =
        num(dribbles.success);

    const duelsWon =
        num(duels.won);

    const yellow =
        num(cards.yellow);

    const red =
        num(cards.red);


    /*
    قدرت پایه
    */

    let power = 45;

    power += rating * 3.8;

    power += goalsTotal * 1.2;

    power += assists * 0.8;

    power += shotsOn * 0.18;

    power += shotsTotal * 0.06;

    power += passesAccuracy * 0.08;

    power += passesTotal * 0.008;

    power += tacklesTotal * 0.12;

    power += dribblesSuccess * 0.12;

    power += duelsWon * 0.08;

    power += appearances * 0.04;

    power -= yellow * 0.04;

    power -= red * 0.20;


    /*
    محدود کردن قدرت
    */

    power =
        Math.max(
            35,
            Math.min(99, power / 5)
        );


    return power;

}


/*
تاکتیک
*/

function tacticModifier(tactic) {

    const modifiers = {

        balanced: {
            attack: 1,
            defense: 1,
            possession: 1
        },

        attacking: {
            attack: 1.10,
            defense: 0.91,
            possession: 1.03
        },

        defensive: {
            attack: 0.91,
            defense: 1.12,
            possession: 0.97
        },

        counter: {
            attack: 1.06,
            defense: 1.01,
            possession: 0.91
        },

        pressing: {
            attack: 1.04,
            defense: 1.06,
            possession: 1.04
        }

    };

    return modifiers[tactic] ||
        modifiers.balanced;

}


/*
قدرت تیم
*/

function calculateTeam(players, tactic) {

    const valid =
        players.filter(Boolean);

    if (!valid.length) {

        return {
            players: [],
            power: 0,
            attack: 0,
            defense: 0,
            passing: 0
        };

    }


    const powers =
        valid.map(calculatePlayerPower);


    const average =
        powers.reduce(
            (a,b)=>a+b,
            0
        ) / powers.length;


    const mod =
        tacticModifier(tactic);


    const stats =
        valid.map(p =>
            p.statistics?.[0] || {}
        );


    let goals = 0;
    let assists = 0;
    let passes = 0;
    let tackles = 0;


    stats.forEach(s => {

        goals +=
            num(s.goals?.total);

        assists +=
            num(s.goals?.assists);

        passes +=
            num(s.passes?.accuracy);

        tackles +=
            num(s.tackles?.total);

    });


    const attack =
        average * mod.attack +
        goals * 0.04 +
        assists * 0.03;


    const defense =
        average * mod.defense +
        tackles * 0.03;


    const passing =
        average +
        passes / Math.max(1, valid.length) * 0.03;


    return {

        players: valid,

        power: Math.round(
            Math.max(
                1,
                Math.min(99, average)
            )
        ),

        attack,

        defense,

        passing

    };

}


/*
تولید عدد با وزن قدرت
*/

function weightedGoals(team, opponent) {

    const attack =
        team.attack;

    const defense =
        opponent.defense;


    const difference =
        attack - defense;


    let expected =
        1.10 + difference / 22;


    expected =
        Math.max(
            0.20,
            Math.min(3.6, expected)
        );


    let goals = 0;


    /*
    شانس کاملاً بی‌ربط نیست؛
    مقدار آن از اختلاف قدرت می‌آید.
    */

    const chances = [

        expected * 0.30,

        expected * 0.20,

        expected * 0.12,

        expected * 0.07

    ];


    for (const chance of chances) {

        if (
            Math.random() <
            Math.min(0.90, chance)
        ) {

            goals++;

        }

    }


    return goals;

}


/*
انتخاب گلزن
*/

function chooseScorer(team) {

    if (!team.players.length)
        return "نامشخص";


    let pool =
        team.players.filter(p => {

            const position =
                p.statistics?.[0]
                ?.games?.position;

            return (
                position === "F" ||
                position === "M"
            );

        });


    if (!pool.length)
        pool = team.players;


    const index =
        Math.floor(
            Math.random() * pool.length
        );


    return pool[index].player.name;

}


/*
بازیکن کارت
*/

function chooseCard(team) {

    if (!team.players.length)
        return null;


    const index =
        Math.floor(
            Math.random() *
            team.players.length
        );


    return team.players[index].player.name;

}


/*
POST /api/simulate
*/

app.post("/api/simulate", async (req,res) => {

    try {

        const {
            team1,
            team2,
            tactic1,
            tactic2,
            players1,
            players2
        } = req.body;


        if (
            !Array.isArray(players1) ||
            !Array.isArray(players2)
        ) {

            return res.status(400).json({
                error:
                "لیست بازیکنان نامعتبر است."
            });

        }


        /*
        پیدا کردن بازیکنان
        */

        const found1 =
            await Promise.all(
                players1.map(findPlayer)
            );


        const found2 =
            await Promise.all(
                players2.map(findPlayer)
            );


        const valid1 =
            found1.filter(Boolean);

        const valid2 =
            found2.filter(Boolean);


        if (!valid1.length) {

            return res.status(400).json({
                error:
                "هیچ بازیکنی از تیم اول پیدا نشد."
            });

        }


        if (!valid2.length) {

            return res.status(400).json({
                error:
                "هیچ بازیکنی از تیم دوم پیدا نشد."
            });

        }


        /*
        محاسبه تیم‌ها
        */

        const t1 =
            calculateTeam(
                valid1,
                tactic1
            );


        const t2 =
            calculateTeam(
                valid2,
                tactic2
            );


        /*
        گل
        */

        let score1 =
            weightedGoals(t1,t2);


        let score2 =
            weightedGoals(t2,t1);


        /*
        اگر اختلاف قدرت خیلی زیاد باشد،
        احتمال برد تیم قوی بیشتر می‌شود.
        */

        const difference =
            t1.power - t2.power;


        if (
            difference > 12 &&
            score1 <= score2 &&
            Math.random() < 0.65
        ) {

            score1 =
                Math.min(5,score2+1);

        }


        if (
            difference < -12 &&
            score2 <= score1 &&
            Math.random() < 0.65
        ) {

            score2 =
                Math.min(5,score1+1);

        }


        /*
        مالکیت
        */

        let possession1 =
            50 +
            (t1.passing-t2.passing)*0.30;


        possession1 =
            Math.round(
                Math.max(
                    30,
                    Math.min(
                        70,
                        possession1
                    )
                )
            );


        const possession2 =
            100-possession1;


        /*
        شوت
        */

        const shots1 =
            Math.max(
                3,
                Math.round(
                    7 +
                    t1.attack/7 +
                    Math.random()*5
                )
            );


        const shots2 =
            Math.max(
                3,
                Math.round(
                    7 +
                    t2.attack/7 +
                    Math.random()*5
                )
            );


        const onTarget1 =
            Math.min(
                shots1,
                Math.max(
                    score1,
                    Math.round(
                        shots1*0.38
                    )
                )
            );


        const onTarget2 =
            Math.min(
                shots2,
                Math.max(
                    score2,
                    Math.round(
                        shots2*0.38
                    )
                )
            );


        /*
        خطا
        */

        const fouls1 =
            Math.round(
                7 +
                Math.random()*10
            );


        const fouls2 =
            Math.round(
                7 +
                Math.random()*10
            );


        /*
        کاشته
        */

        const freeKicks1 =
            Math.round(
                fouls2*0.65
            );


        const freeKicks2 =
            Math.round(
                fouls1*0.65
            );


        /*
        کرنر
        */

        const corners1 =
            Math.max(
                1,
                Math.round(
                    shots1*0.42
                )
            );


        const corners2 =
            Math.max(
                1,
                Math.round(
                    shots2*0.42
                )
            );


        /*
        گل‌ها
        */

        const goals=[];


        for(let i=0;i<score1;i++){

            goals.push({

                minute:
                    Math.floor(
                        Math.random()*86
                    )+5,

                team:team1,

                player:
                    chooseScorer(t1)

            });

        }


        for(let i=0;i<score2;i++){

            goals.push({

                minute:
                    Math.floor(
                        Math.random()*86
                    )+5,

                team:team2,

                player:
                    chooseScorer(t2)

            });

        }


        goals.sort(
            (a,b)=>
            a.minute-b.minute
        );


        /*
        کارت زرد
        */

        const yellow=[];


        const yellowCount1 =
            Math.random()<0.80
            ? Math.floor(Math.random()*3)
            : 0;


        const yellowCount2 =
            Math.random()<0.80
            ? Math.floor(Math.random()*3)
            : 0;


        for(
            let i=0;
            i<yellowCount1;
            i++
        ){

            yellow.push({

                minute:
                    Math.floor(
                        Math.random()*80
                    )+10,

                team:team1,

                player:chooseCard(t1)

            });

        }


        for(
            let i=0;
            i<yellowCount2;
            i++
        ){

            yellow.push({

                minute:
                    Math.floor(
                        Math.random()*80
                    )+10,

                team:team2,

                player:chooseCard(t2)

            });

        }


        /*
        قرمز
        */

        const red=[];


        if(Math.random()<0.05){

            red.push({

                minute:
                    Math.floor(
                        Math.random()*50
                    )+35,

                team:
                    Math.random()<0.5
                    ?team1
                    :team2,

                player:
                    Math.random()<0.5
                    ?chooseCard(t1)
                    :chooseCard(t2)

            });

        }


        /*
        بهترین بازیکن
        */

        const allPlayers =
            [...valid1,...valid2];


        allPlayers.sort(
            (a,b)=>
            calculatePlayerPower(b) -
            calculatePlayerPower(a)
        );


        const best =
            allPlayers[0];


        const bestRating =
            Math.min(
                10,
                Math.max(
                    6,
                    (
                        calculatePlayerPower(best)
                        /10
                    )
                )
            ).toFixed(1);


        res.json({

            team1,
            team2,

            score1,
            score2,

            possession1,
            possession2,

            shots1,
            shots2,

            onTarget1,
            onTarget2,

            fouls1,
            fouls2,

            freeKicks1,
            freeKicks2,

            corners1,
            corners2,

            goals,

            yellow,

            red,

            bestPlayer:
                best.player.name,

            bestRating,

            power1:t1.power,

            power2:t2.power

        });


    } catch(error) {

        console.error(error);

        res.status(500).json({

            error:
            "خطا هنگام شبیه‌سازی مسابقه."

        });

    }

});


app.listen(PORT,()=>{

    console.log(
        `League Simulator running on port ${PORT}`
    );

});
