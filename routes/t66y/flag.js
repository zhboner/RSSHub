const cheerio = require('cheerio');
const config = require('../../config');
const axios = require('../../utils/axios');
const iconv = require('iconv-lite');
const url = require('url');

const base = 'http://www.t66y.com';
const section = 'thread0806.php?fid=16';
const axios_ins = axios.create({
    headers: {
        'User-Agent': config.ua,
        Referer: url.resolve(base, section),
    },
    responseType: 'arraybuffer',
});

const sourceTimezoneOffset = -8;
module.exports = async (ctx) => {
    const res = await axios_ins.get(url.resolve(base, section));
    const data = iconv.decode(res.data, 'gbk');
    const $ = cheerio.load(data);
    const list = $('.tr3.t_one.tac:nth-of-type(n+12)');
    const reqList = [];
    const out = [];
    const indexList = []; // New item index

    for (let i = 0; i < Math.min(list.length, 20); i++) {
        const $ = cheerio.load(list[i]);
        let title = $('.tal h3 a');
        const path = title.attr('href');
        const link = url.resolve(base, path);

        // Check cache
        const cache = await ctx.cache.get(link);
        if (cache) {
            out.push(JSON.parse(cache));
            continue;
        }

        if (
            cheerio
                .load(title)('font')
                .text() !== ''
        ) {
            title = cheerio
                .load(title)('font')
                .text();
        } else {
            title = title.text();
        }

        const single = {
            title: title,
            link: link,
            guid: path,
        };
        const promise = axios_ins.get(url.resolve(base, path));
        reqList.push(promise);
        indexList.push(i);
        out.push(single);
    }
    let resList;
    try {
        resList = await axios.all(reqList);
    } catch (error) {
        ctx.state.data = `Error occurred: ${error}`;
        return;
    }
    for (let i = 0; i < resList.length; i++) {
        let item = resList[i];
        item = iconv.decode(item.data, 'gbk');
        let $ = cheerio.load(item);
        let time = $('#main > div:nth-child(4) > table > tbody > tr:nth-child(2) > th > div').text();
        const regex = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/;
        const regRes = regex.exec(time);
        time = regRes === null ? new Date() : new Date(regRes[0]);
        time.setTime(time.getTime() + (sourceTimezoneOffset - time.getTimezoneOffset() / 60) * 60 * 60 * 1000);

        const content = $('#main > div:nth-child(4) > table > tbody > tr.tr1.do_not_catch > th:nth-child(2) > table > tbody > tr > td > div.tpc_content.do_not_catch').html();

        // Change the image tag to display image in rss reader
        $ = cheerio.load(content);
        const images = $('input');
        for (let k = 0; k < images.length; k++) {
            $(images[k]).replaceWith(`<img src="${$(images[k]).attr('data-src')}">`);
        }
        out[indexList[i]].description = $.html();
        out[indexList[i]].pubDate = time.toUTCString();
        ctx.cache.set(out[indexList[i]].link, JSON.stringify(out[indexList[i]]), 24 * 60 * 60);
    }

    ctx.state.data = {
        title: $('title').text(),
        link: url.resolve(base, section),
        item: out,
    };
};