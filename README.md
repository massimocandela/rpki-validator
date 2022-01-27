# rpki-validator

This is a JavaScript tool which provides RPKI lookup/validation functionalities.  
This tool is designed to be used for data analysis and visualization, and it is able to check more than 20k prefixes per second. It works both server side with node.js or in the browser.

> This tool is not designed for routing security implementation.
> There is no cryptography involved in this tool, the validation is based on Validated ROA Payloads files (VRPs)

VRP files are provided by:
* [rpki-client.org](https://www.rpki-client.org/) ([rpki-client](https://www.rpki-client.org/))
* [NTT](https://www.gin.ntt.net/) ([rpki-client](https://www.rpki-client.org/))
* [RIPE NCC](https://www.ripe.net) ([Routinator](https://www.nlnetlabs.nl/projects/rpki/routinator/))
* [Cloudflare](https://cloudflare.com) ([OctoRPKI](https://github.com/cloudflare/cfrpki))



## Install
Run:
`npm install rpki-validator`

Place in your code: `import RpkiValidator from "rpki-validator";`

## Validate

To validate the a `<prefix, origin>` pair:

```
const prefix = "165.254.225.0/24";
const origin = 15562;
const verbose = true;

const rpki = new RpkiValidator();

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
        asn: 15562,
        prefix: "165.254.225.0/21",
        maxLength: 24,
        expires: 1633702845
    }]
}
```

Possible `reason` values are:
* Not valid origin
* Not valid prefix length
* No ROA available for this prefix
* `null` (when `valid` is `true`)

The `covering` array is the list of ROAs covering the queried prefix.

> IMPORTANT: In this case you are not using a VRP file, but an online API. Please, read the section below to understand how to load a VRP file and do more frequent validations.

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

The `.preCache()` method can take an optional parameter indicating after how many minutes the cache will be automatically refreshed (see [below](#rpki-auto-refresh-limits) for more info). E.g., `prki.preCache(60)` to refresh the cache every hour.


> IMPORTANT: `preCache` uses a good amount of memory (at the moment ~20Mb, but this will grow in the future) to store the cache. This may be less suitable for running in a browser.


## Options

It is possible to specify options while creating the validator. In the following way:

```
const options = {
    httpsAgent: an http(s) agent, e.g., to use a proxy https://www.npmjs.com/package/https-proxy-agent
    connector: one of "rpkiclient", "ntt", "cloudflare", "ripe", "external", "api" (default: "rpkiclient")
};

const rpki = new RpkiValidator(options);
```

Example, to change the VRP provider to NTT:

```js
const rpki = new RpkiValidator({ connector: "ntt" });
```

> IMPORTANT: The `connector` option changes the VRP provider for the `preCache()` method. All the validation done without cache rely on the online API offered by rpki.massimocandela.com.

### RPKI auto-refresh limits
Each connector has limits on how much time can be specified for the auto-refresh option:
* rpkiclient, 5 min
* ntt, 15 min
* ripe, 10 min
* cloudflare, 20 min
* external, not available (based on when new data is applied)
* api, 5 min


## External VRPs
You can load your VRPs in the following way:

```javascript
const rpki = new rpkiValidator({ connector: "external" });

rpki.setVRPs([{
    prefix: "123.4.5.0/24",
    maxLength: 24,
    asn: 1234
}, {
    prefix: "321.4.5.0/22",
    maxLength: 22,
    asn: 9876
}
]);

rpki.preCache()
    .then(() => {
        // External VRPs loaded

        rpki.validate(prefix, origin, verbose)
            .then((result) => {
                // Do something with "result"
            })
    })
```


## VRPs on custom API
Also, you can load your VRPs by providing a URL of an API.

```javascript
const rpki = new rpkiValidator({ connector: "api", url: "https://my-api.api.com/vrps/" });

rpki.preCache()
    .then(() => {
        // VRPs from API loaded

        rpki.validate(prefix, origin, verbose)
            .then((result) => {
                // Do something with "result"
            })
    })
```


The API must produce a JSON output like:

```json
{
  "roas": [{
    "prefix": "123.4.5.0/24",
    "maxLength": 24,
    "asn": 1234
  }, {
    "prefix": "321.4.5.0/22",
    "maxLength": 22,
    "asn": 9876
  }]
}

```
