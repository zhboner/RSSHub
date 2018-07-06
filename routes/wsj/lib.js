const cheerio = require('cheerio');
const axios = require('../../utils/axios');
const url = require('url');

module.exports = async (ctx, site, index) => {
    const res = await axios.get(site);
    const $ = cheerio.load(res.data);
    let news = $('a', 'h3');
    if (index) {
        news = $('a', 'h3')
            .add('a', 'h4')
            .add('a', 'li')
            .not('a[role=button]');
    }

    const reqList = [];
    const out = [];
    const indexList = [];
    const itemSet = {};
    let skip = 0;

    for (let i = 0; i < news.length; i++) {
        const single = cheerio(news[i]);
        let link = single.attr('href');
        const search = url.parse(link).search;
        if (search) {
            link = link.slice(0, link.length - search.length);
        }
        if (itemSet[link]) {
            skip++;
            continue;
        }
        itemSet[link] = 1;
        const title = single.text();

        const cache = await ctx.cache.get(link);
        if (cache) {
            out.push(JSON.parse(cache));
            continue;
        }

        out.push({
            title: title,
            link: link,
            guid: link,
        });
        reqList.push(axios.get(link));
        indexList.push(i - skip);
    }

    const resList = await axios.all(reqList);

    for (let i = 0; i < resList.length; i++) {
        const res = resList[i];
        const $ = cheerio.load(res.data);
        let description = '';
        let descriptionNode = $('h2[itemprop=description]');
        if (descriptionNode && descriptionNode.length !== 0) {
            description = descriptionNode.text();
        } else {
            descriptionNode = $('h2[itemprop=caption]');
            if (descriptionNode && descriptionNode.length !== 0) {
                description = descriptionNode.text();
            }
        }
        out[indexList[i]].description = description;
        out[indexList[i]].pubDate = new Date().toUTCString();
    }

    return {
        title: $('title').text(),
        link: site,
        item: out,
    };
};
