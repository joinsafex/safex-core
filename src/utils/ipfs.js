const fetch = require("node-fetch");
const encoder = new TextEncoder();

export const ipfsPublish = async (fileName, data) => {
    const encodedData = encoder.encode(data)
    const buffer = await Buffer.from(encodedData);
    return new Promise((resolve, reject) => {
      fetch('https://ipfs.kleros.io/add', {
        method: 'POST',
        body: JSON.stringify({
          fileName,
          buffer,
        }),
        headers: {
          'content-type': 'application/json',
        },
      })
        .then((response) => response.json())
        .then((success) => resolve(success.data))
        .catch((err) => reject(err));
    });
  };