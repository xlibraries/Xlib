import { Component } from 'react'
import { formatClock } from '../../lib/clock'

type ClockProps = { onlyTime?: boolean; onlyDay?: boolean };
type ClockState = { hour_12: boolean; current_time: Date | null };

export default class Clock extends Component<ClockProps, ClockState> {
    update_time?: ReturnType<typeof setInterval>;

    constructor(props: ClockProps) {
        super(props);
        this.state = {
            hour_12: true,
            // set after mount: a time rendered on the server never matches the browser's (hydration error)
            current_time: null
        };
    }

    componentDidMount() {
        this.setState({ current_time: new Date() });
        this.update_time = setInterval(() => {
            this.setState({ current_time: new Date() });
        }, 10 * 1000);
    }

    componentWillUnmount() {
        clearInterval(this.update_time);
    }

    render() {
        const { current_time } = this.state;
        if (!current_time) return <span>&nbsp;</span>;
        return <span>{formatClock(current_time, { hour12: this.state.hour_12, onlyTime: this.props.onlyTime, onlyDay: this.props.onlyDay })}</span>;
    }
}
