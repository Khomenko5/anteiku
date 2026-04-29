module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Поки що без плагінів, щоб прибрати помилку .plugins
    plugins: [], 
  };
};