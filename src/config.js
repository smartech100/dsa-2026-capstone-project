const configuredPort = process.env.PORT === undefined ? 3000 : Number(process.env.PORT);

if (!Number.isInteger(configuredPort) || configuredPort < 0 || configuredPort > 65535) {
  throw new RangeError('PORT must be an integer between 0 and 65535');
}

export const PORT = configuredPort;
