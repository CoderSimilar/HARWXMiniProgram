// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud1-1g7y8cuncdb9ded2' }) // 使用当前云环境

// 云函数入口函数
exports.main = async (event, context) => {
  console.log("尝试连接。。。")
  try {
    // 尝试查询云数据库中的一个集合
    const db = cloud.database();
    const collection = db.collection('walking');
    await collection.get();

    return {
      connected: true,
    };
  } catch (error) {
    console.error('连接失败', error);

    return {
      connected: false,
    };
  }
}