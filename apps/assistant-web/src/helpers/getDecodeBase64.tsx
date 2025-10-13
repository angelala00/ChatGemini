export const getDecodeBase64 = (base64String: string) => {
    try {
        return decodeURIComponent(escape(atob(base64String)))
    } catch (error) {
        console.error('Base64 解码失败：', error);
        throw error;
    }
};
