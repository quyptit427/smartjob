export default {
  async scheduled(_event, env) {
    const response = await fetch(env.API_HEALTH_URL);
    if (!response.ok) throw new Error(`health ${response.status}`);
  },
};
