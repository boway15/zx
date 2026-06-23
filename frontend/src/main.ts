import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import 'vant/lib/index.css';
import './styles/theme.css';
import {
  Button,
  NavBar,
  Tabbar,
  TabbarItem,
  Cell,
  CellGroup,
  Card,
  Tag,
  Empty,
  Loading,
  Dialog,
  Toast,
  Form,
  Field,
  List,
  PullRefresh,
  Grid,
  GridItem,
  Divider,
  NoticeBar,
  Radio,
  RadioGroup,
  Popup,
  Tabs,
  Tab,
  Collapse,
  CollapseItem,
  Switch,
  Icon,
  Uploader,
  Calendar,
} from 'vant';

const app = createApp(App);
app.use(createPinia());
app.use(router);
[
  Button,
  NavBar,
  Tabbar,
  TabbarItem,
  Cell,
  CellGroup,
  Card,
  Tag,
  Empty,
  Loading,
  Dialog,
  Toast,
  Form,
  Field,
  List,
  PullRefresh,
  Grid,
  GridItem,
  Divider,
  NoticeBar,
  Radio,
  RadioGroup,
  Popup,
  Tabs,
  Tab,
  Collapse,
  CollapseItem,
  Switch,
  Icon,
  Uploader,
  Calendar,
].forEach((c) => app.use(c));

app.mount('#app');
