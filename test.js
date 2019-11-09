var rpki = require("./index");


rpki.preCache(15)
    .then(() => {

        console.log("REQUESTING");
        rpki.validate("185.171.91.0/24", "551540", true).then(console.log);
    });