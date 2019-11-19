[![Build Status](https://api.travis-ci.com/massimocandela/rpki-validator.svg)](https://travis-ci.com/massimocandela/rpki-validator)
![Dependabot Status](https://badgen.net/dependabot/massimocandela/rpki-validator/?icon=dependabot)
[![Known Vulnerabilities](https://snyk.io/test/github/massimocandela/rpki-validator/badge.svg?targetFile=package.json)](https://snyk.io/test/github/massimocandela/rpki-validator?targetFile=package.json)

# rpki-validator

This is a JavaScript tool which provides some basic rpki validation functionalities.
The tool is designed to be used for data analysis and visualization, both server-side with node.js or client-side in the browser.

This tool is not designed for routing security implementation.
There is no cryptography involved in this tool, the validation is based on the Validated ROA Prefixes (VRPs) lists provided by [RIPE NCC](https://www.ripe.net) and [Cloudflare](https://cloudflare.com).

## Install
Run: 
`npm install rpki-validator`

Place in your code: `var rpki = require("rpki-validator");`

## Validate

To validate the a `<prefix, origin>` pair:

```
const prefix = "202.153.208.0/21";
const origin = "4764";
const verbose = true;

rpki.validate(prefix, origin, verbose)
    .then((result) => {
        // Do something with "result"
    })
```

The parameter `verbose` defines the amount of information provided as a result.

If `verbose` is `false` or missing, the result will be one of:
* `true` - if rpki valid
* `false` - if rpki invalid
* `null` - if no ROA was found for this prefix


If `verbose` is `true`, the result will be an object like:

```
{
    valid: true|false|null,
    reason: "A string describing the reason",
    covering: [{
        origin: "4760",
        prefix: "218.103.32.0/19",
        maxLength: 23
    }]
}
```

Possible `reason` values are:
* Not valid origin
* Not valid prefix length
* No ROA available for this prefix
* `null` (when `valid` is `true`)

The `covering` array is the list of ROAs covering the queried prefix.


## Multiple validations

If you are planning to validate many `<prefix, origin>` pairs, use `preCache` as shown below:

```
rpki.preCache()
    .then(() => {
        // The cache is loaded, do here your validations

        rpki.validate(prefix, origin, verbose)
            .then((result) => {
                // Do something with "result"
            })
    })

```

The `preCache` method downloads a complete VRP list, this may take some seconds. Do your validations inside the `.then` if you want to be sure all validations are happening in cache.
If you instead do validations outside the `.then`, these will be executed online up to when the cache is ready. When the cache is ready, all validations will happen based on the cache.

The `.preCache()` method can take an optional parameter indicating after how many minutes (>15) the cache will be automatically refreshed. E.g. `prki.preCache(60)` to refresh the cache every hour.

> IMPORTANT: `preCache` uses a good amount of memory (at the moment ~20Mb, but this will grow in the future) to store the cache. This may be less suitable for running in a browser.
