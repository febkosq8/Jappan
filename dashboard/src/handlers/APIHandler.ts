import axios from "axios";

axios.defaults.baseURL = import.meta.env.PROD ? "https://api-jappan.febkosq8.me" : "http://localhost:8875";

class APIHandler {}
export default APIHandler;
